import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { parseRetrievalCid, type RetrievalCid } from '../cid.ts'
import { type Db, type DbFactory, type DbStats, openNetworkDb } from '../db.ts'
import { networkUnavailable, notFound } from '../errors.ts'
import { rateLimit } from '../middleware/rate-limit.ts'
import type { Schemas } from '../networks.ts'
import { NETWORKS, type NetworkName } from '../networks.ts'
import {
  findHintedProvider,
  findIpfsRootProvider,
  findPieceProvider,
  type PieceProvider,
} from '../queries/pieces.ts'
import {
  BooleanQuery,
  errorResponses,
  NetworkSchema,
  notFoundResponse,
  RetrievalCidInput,
  UintInput,
} from '../schemas/common.ts'
import { staleWhileRevalidate } from '../swr-cache.ts'
import { activeSpan, setAttributes } from '../tracing.ts'
import type { AppEnv } from '../types.ts'
import { validationHook } from './hook.ts'

/** How long a resolved provider is served without revalidating. */
export const PROVIDER_FRESH_MS = 10 * 60_000

/** How long a resolved provider stays cached and may be served stale. */
export const PROVIDER_MAX_AGE_S = 24 * 60 * 60

/**
 * Service Worker IPFS gateway that verifies content in the browser.
 *
 * @see https://inbrowser.link
 */
export const INBROWSER_URL = 'https://inbrowser.link'

/** Cache-Control for redirects to a provider, which can change. */
export const PROVIDER_REDIRECT_CACHE_CONTROL = 'public, max-age=60'

/** Cache-Control for redirects to inbrowser.link, which never change. */
const GATEWAY_REDIRECT_CACHE_CONTROL = 'public, max-age=86400'

/** Query parameters consumed by the route rather than forwarded. */
const OWN_PARAMS = new Set(['network', 'browser', 'provider'])

const route = createRoute({
  operationId: 'retrieve',
  method: 'get',
  path: '/get/{cid}',
  tags: ['Retrieval'],
  summary: 'Redirect to where content can be retrieved',
  description: [
    'Redirects a PieceCID to `/piece/{cid}` on a storage provider serving it,',
    'or with `browser=true` to inbrowser.link when the piece has `ipfsRootCID`',
    'metadata in an IPFS-indexed data set.',
    'Redirects an IPFS root CID to `/ipfs/{cid}` on a provider with a piece',
    'whose `ipfsRootCID` metadata matches, or to inbrowser.link with',
    '`browser=true`. When no indexed copy exists, `provider` names the',
    'provider to redirect to instead. Other query parameters are forwarded.',
  ].join(' '),
  request: {
    params: z.object({
      cid: RetrievalCidInput.openapi({ param: { name: 'cid', in: 'path' } }),
    }),
    query: z.object({
      network: NetworkSchema.default('mainnet'),
      browser: BooleanQuery.optional().openapi({
        description:
          'Open IPFS content, or a piece with an IPFS root, in the browser through inbrowser.link',
      }),
      provider: UintInput.optional().openapi({
        description:
          'Provider ID to redirect to when no indexed copy exists yet, such as a piece the provider has but has not committed on chain',
      }),
    }),
  },
  responses: {
    302: {
      description: 'Redirect to the retrieval URL',
      headers: {
        Location: { description: 'Retrieval URL', schema: { type: 'string' } },
        'X-Cache': {
          description: 'Provider cache status: hit, stale, miss or none',
          schema: { type: 'string' },
        },
      },
    },
    ...notFoundResponse,
    ...errorResponses,
  },
})

/**
 * URL for `path` under `base`, keeping any base path, with the request's
 * query parameters other than the route's own.
 */
export function retrievalUrl(
  base: string,
  path: string,
  query: URLSearchParams
): string {
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`)
  for (const [key, value] of query) {
    if (!OWN_PARAMS.has(key)) url.searchParams.append(key, value)
  }
  return url.toString()
}

/** Where and how {@link lookupProvider} queries one network's database. */
interface LookupOptions {
  env: AppEnv['Bindings']
  network: NetworkName
  dbFactory: DbFactory
  stats: DbStats
  waitUntil?: (promise: Promise<unknown>) => void
}

/** Look up a provider with `find` in one network's database. */
async function lookupProvider(
  options: LookupOptions,
  find: (db: Db, schemas: Schemas) => Promise<PieceProvider | undefined>
): Promise<PieceProvider | undefined> {
  const { env, network, dbFactory, stats } = options
  const opened = openNetworkDb(env, network, dbFactory, stats)
  if (!opened) throw networkUnavailable(network)
  try {
    return await find(opened.db, opened.network.schemas)
  } finally {
    if (options.waitUntil) options.waitUntil(opened.close())
    else await opened.close()
  }
}

/** Find the indexed provider serving a CID. */
function indexedProvider(cid: RetrievalCid) {
  const find = cid.kind === 'piece' ? findPieceProvider : findIpfsRootProvider
  return (db: Db, schemas: Schemas) => find(db, schemas, cid.cid)
}

/**
 * `GET /get/{cid}`: redirect a PieceCID or IPFS root CID to a storage
 * provider serving it, without proxying the content. Resolved providers are
 * cached per network and CID with stale-while-revalidate. A `provider` hint
 * is used only when no indexed copy exists, and is never cached, so the
 * indexed ranking takes over once the indexer has the content.
 *
 * @see https://github.com/filecoin-project/curio/blob/main/documentation/en/curio-market/retrievals.md
 */
export function retrievalRoutes(dbFactory: DbFactory) {
  const api = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })
  api.use('/get/*', rateLimit('RATE_LIMIT_API'))

  api.openapi(route, async (c) => {
    const { cid } = c.req.valid('param')
    const { network, browser, provider: hint } = c.req.valid('query')
    const query = new URL(c.req.url).searchParams
    const span = activeSpan()
    setAttributes(span, { 'fil.cid.kind': cid.kind })

    if (cid.kind === 'ipfs' && browser) {
      c.header('Cache-Control', GATEWAY_REDIRECT_CACHE_CONTROL)
      c.header('X-Cache', 'none')
      return c.redirect(
        retrievalUrl(INBROWSER_URL, `ipfs/${cid.cid}`, query),
        302
      )
    }

    c.set('network', NETWORKS[network])
    const lookup = { env: c.env, network, dbFactory }
    const inRequest: LookupOptions = {
      ...lookup,
      stats: c.var.dbStats,
      waitUntil: (p) => c.executionCtx.waitUntil(p),
    }
    const find = indexedProvider(cid)
    const { value: indexed, status } = await staleWhileRevalidate({
      cache: caches.default,
      key: new URL(`/__cache/v2/${network}/${cid.kind}/${cid.cid}`, c.req.url)
        .href,
      freshMs: PROVIDER_FRESH_MS,
      maxAgeSeconds: PROVIDER_MAX_AGE_S,
      load: () => lookupProvider(inRequest, find),
      revalidate: () => lookupProvider({ ...lookup, stats: newStats() }, find),
      waitUntil: (p) => c.executionCtx.waitUntil(p),
    })
    const provider =
      indexed ??
      (hint === undefined
        ? undefined
        : await lookupProvider(inRequest, (db, schemas) =>
            findHintedProvider(db, schemas, hint)
          ))
    setAttributes(span, {
      'fil.cache': status,
      'fil.provider_id': provider?.providerId,
      'fil.provider_hint': indexed === undefined && provider !== undefined,
    })
    if (!provider) {
      throw notFound(cid.kind === 'piece' ? 'Piece' : 'IPFS root', cid.cid)
    }

    c.header('Cache-Control', PROVIDER_REDIRECT_CACHE_CONTROL)
    c.header('X-Cache', status)
    const root = browser ? ipfsRoot(provider.ipfsRootCid) : undefined
    if (root) {
      return c.redirect(retrievalUrl(INBROWSER_URL, `ipfs/${root}`, query), 302)
    }
    // Kinds match Curio's endpoints: `/piece/{cid}` and `/ipfs/{cid}`.
    return c.redirect(
      retrievalUrl(provider.serviceUrl, `${cid.kind}/${cid.cid}`, query),
      302
    )
  })

  return api
}

/**
 * Normalized IPFS root CID from piece metadata, or `undefined` when the
 * metadata has none or holds something other than an IPFS CID.
 */
function ipfsRoot(value: string | null): string | undefined {
  if (!value) return undefined
  try {
    const cid = parseRetrievalCid(value)
    return cid.kind === 'ipfs' ? cid.cid : undefined
  } catch {
    return undefined
  }
}

/** Empty {@link DbStats} for work outside the request's own totals. */
function newStats(): DbStats {
  return { queries: 0, ms: 0 }
}
