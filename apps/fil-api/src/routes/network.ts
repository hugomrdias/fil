import { createRoute, OpenAPIHono, type z } from '@hono/zod-openapi'
import { notFound } from '../errors.ts'
import { networkMiddleware } from '../middleware/network.ts'
import { rateLimit } from '../middleware/rate-limit.ts'
import { getDataSet, listDataSets } from '../queries/data-sets.ts'
import { getPiece, listDataSetPieces, listPieces } from '../queries/pieces.ts'
import { getProvider, listProviders } from '../queries/providers.ts'
import { getRail, listRailSettlements, listRails } from '../queries/rails.ts'
import {
  listSessionKeyEvents,
  listSessionKeys,
} from '../queries/session-keys.ts'
import { getStatus } from '../queries/status.ts'
import {
  errorResponses,
  itemOf,
  NetworkParams,
  notFoundResponse,
  PageQuery,
  pageOf,
  UintInput,
} from '../schemas/common.ts'
import {
  ListDataSetPiecesQuery,
  ListDataSetsQuery,
  ListPiecesQuery,
  ListProvidersQuery,
  ListRailsQuery,
  ListSessionKeyEventsQuery,
  ListSessionKeysQuery,
} from '../schemas/queries.ts'
import {
  DataSetSchema,
  PieceSchema,
  PieceWithDataSetSchema,
  ProviderSchema,
  RailSchema,
  SessionKeyEventSchema,
  SessionKeySchema,
  SettlementSchema,
  StatusSchema,
} from '../schemas/resources.ts'
import type { AppEnv } from '../types.ts'
import { validationHook } from './hook.ts'

/** JSON response entry for an OpenAPI route. */
function ok<T extends z.ZodType>(schema: T, description: string) {
  return {
    200: { description, content: { 'application/json': { schema } } },
  }
}

/** Path parameter for a numeric id. */
function idParam(name: string) {
  return UintInput.openapi({ param: { name, in: 'path' }, example: '1' })
}

const ProviderParams = NetworkParams.extend({
  providerId: idParam('providerId'),
})
const DataSetParams = NetworkParams.extend({ dataSetId: idParam('dataSetId') })
const PieceParams = DataSetParams.extend({ pieceId: idParam('pieceId') })
const RailParams = NetworkParams.extend({ railId: idParam('railId') })

const routes = {
  status: createRoute({
    method: 'get',
    path: '/{network}/status',
    tags: ['Status'],
    summary: 'Indexer status',
    description: 'Chain id and latest, safe and finalized indexed blocks.',
    request: { params: NetworkParams },
    responses: {
      ...ok(itemOf(StatusSchema, 'StatusResponse'), 'Network status'),
      ...errorResponses,
    },
  }),
  listProviders: createRoute({
    method: 'get',
    path: '/{network}/providers',
    tags: ['Providers'],
    summary: 'List storage providers',
    request: { params: NetworkParams, query: ListProvidersQuery },
    responses: {
      ...ok(pageOf(ProviderSchema, 'ProviderPage'), 'Providers'),
      ...errorResponses,
    },
  }),
  getProvider: createRoute({
    method: 'get',
    path: '/{network}/providers/{providerId}',
    tags: ['Providers'],
    summary: 'Get a storage provider',
    request: { params: ProviderParams },
    responses: {
      ...ok(itemOf(ProviderSchema, 'ProviderResponse'), 'Provider'),
      ...notFoundResponse,
      ...errorResponses,
    },
  }),
  listDataSets: createRoute({
    method: 'get',
    path: '/{network}/data-sets',
    tags: ['Data sets'],
    summary: 'List data sets',
    request: { params: NetworkParams, query: ListDataSetsQuery },
    responses: {
      ...ok(pageOf(DataSetSchema, 'DataSetPage'), 'Data sets'),
      ...errorResponses,
    },
  }),
  getDataSet: createRoute({
    method: 'get',
    path: '/{network}/data-sets/{dataSetId}',
    tags: ['Data sets'],
    summary: 'Get a data set',
    request: { params: DataSetParams },
    responses: {
      ...ok(itemOf(DataSetSchema, 'DataSetResponse'), 'Data set'),
      ...notFoundResponse,
      ...errorResponses,
    },
  }),
  listDataSetPieces: createRoute({
    method: 'get',
    path: '/{network}/data-sets/{dataSetId}/pieces',
    tags: ['Pieces'],
    summary: 'List pieces in a data set',
    request: { params: DataSetParams, query: ListDataSetPiecesQuery },
    responses: {
      ...ok(pageOf(PieceSchema, 'PiecePage'), 'Pieces'),
      ...errorResponses,
    },
  }),
  getPiece: createRoute({
    method: 'get',
    path: '/{network}/data-sets/{dataSetId}/pieces/{pieceId}',
    tags: ['Pieces'],
    summary: 'Get a piece',
    request: { params: PieceParams },
    responses: {
      ...ok(itemOf(PieceSchema, 'PieceResponse'), 'Piece'),
      ...notFoundResponse,
      ...errorResponses,
    },
  }),
  listPieces: createRoute({
    method: 'get',
    path: '/{network}/pieces',
    tags: ['Pieces'],
    summary: 'Find pieces by owner, PieceCID or provider',
    description: 'Requires at least one of owner, cid or provider_id.',
    request: { params: NetworkParams, query: ListPiecesQuery },
    responses: {
      ...ok(
        pageOf(PieceWithDataSetSchema, 'PieceWithDataSetPage'),
        'Pieces with data set owner and provider'
      ),
      ...errorResponses,
    },
  }),
  listRails: createRoute({
    method: 'get',
    path: '/{network}/rails',
    tags: ['Rails'],
    summary: 'List payment rails',
    request: { params: NetworkParams, query: ListRailsQuery },
    responses: {
      ...ok(pageOf(RailSchema, 'RailPage'), 'Rails'),
      ...errorResponses,
    },
  }),
  getRail: createRoute({
    method: 'get',
    path: '/{network}/rails/{railId}',
    tags: ['Rails'],
    summary: 'Get a payment rail',
    request: { params: RailParams },
    responses: {
      ...ok(itemOf(RailSchema, 'RailResponse'), 'Rail'),
      ...notFoundResponse,
      ...errorResponses,
    },
  }),
  listRailSettlements: createRoute({
    method: 'get',
    path: '/{network}/rails/{railId}/settlements',
    tags: ['Rails'],
    summary: 'List rail settlements',
    request: { params: RailParams, query: PageQuery },
    responses: {
      ...ok(pageOf(SettlementSchema, 'SettlementPage'), 'Settlements'),
      ...errorResponses,
    },
  }),
  listSessionKeys: createRoute({
    method: 'get',
    path: '/{network}/session-keys',
    tags: ['Session keys'],
    summary: 'List session keys',
    description:
      'Latest expiry per permission for each (identity, signer) pair.',
    request: { params: NetworkParams, query: ListSessionKeysQuery },
    responses: {
      ...ok(pageOf(SessionKeySchema, 'SessionKeyPage'), 'Session keys'),
      ...errorResponses,
    },
  }),
  listSessionKeyEvents: createRoute({
    method: 'get',
    path: '/{network}/session-keys/history',
    tags: ['Session keys'],
    summary: 'List session key authorization events',
    request: { params: NetworkParams, query: ListSessionKeyEventsQuery },
    responses: {
      ...ok(
        pageOf(SessionKeyEventSchema, 'SessionKeyEventPage'),
        'Session key events'
      ),
      ...errorResponses,
    },
  }),
}

/** Cache-Control for successful reads. */
export const CACHE_CONTROL = 'public, max-age=15, stale-while-revalidate=60'

/** Routes under `/{network}` for REST reads. */
export function networkRoutes() {
  const api = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })
  api.use(
    '/:network/*',
    rateLimit('RATE_LIMIT_API'),
    networkMiddleware,
    async (c, next) => {
      await next()
      if (c.res.status === 200) c.header('Cache-Control', CACHE_CONTROL)
    }
  )

  api.openapi(routes.status, async (c) => {
    const data = await getStatus(c.var.db, c.var.network)
    return c.json({ data }, 200)
  })

  api.openapi(routes.listProviders, async (c) => {
    const q = c.req.valid('query')
    const page = await listProviders(c.var.db, c.var.network.schemas, q)
    return c.json(page, 200)
  })

  api.openapi(routes.getProvider, async (c) => {
    const { providerId } = c.req.valid('param')
    const data = await getProvider(c.var.db, c.var.network.schemas, providerId)
    if (!data) throw notFound('Provider', providerId)
    return c.json({ data }, 200)
  })

  api.openapi(routes.listDataSets, async (c) => {
    const q = c.req.valid('query')
    const page = await listDataSets(c.var.db, c.var.network.schemas, {
      ...q,
      providerId: q.provider_id,
      withCdn: q.with_cdn,
    })
    return c.json(page, 200)
  })

  api.openapi(routes.getDataSet, async (c) => {
    const { dataSetId } = c.req.valid('param')
    const data = await getDataSet(c.var.db, c.var.network.schemas, dataSetId)
    if (!data) throw notFound('Data set', dataSetId)
    return c.json({ data }, 200)
  })

  api.openapi(routes.listDataSetPieces, async (c) => {
    const { dataSetId } = c.req.valid('param')
    const q = c.req.valid('query')
    const page = await listDataSetPieces(c.var.db, c.var.network.schemas, {
      ...q,
      dataSetId,
    })
    return c.json(page, 200)
  })

  api.openapi(routes.getPiece, async (c) => {
    const { dataSetId, pieceId } = c.req.valid('param')
    const data = await getPiece(
      c.var.db,
      c.var.network.schemas,
      dataSetId,
      pieceId
    )
    if (!data) throw notFound('Piece', `${dataSetId}/${pieceId}`)
    return c.json({ data }, 200)
  })

  api.openapi(routes.listPieces, async (c) => {
    const q = c.req.valid('query')
    const page = await listPieces(c.var.db, c.var.network.schemas, {
      ...q,
      providerId: q.provider_id,
    })
    return c.json(page, 200)
  })

  api.openapi(routes.listRails, async (c) => {
    const q = c.req.valid('query')
    const page = await listRails(c.var.db, c.var.network.schemas, q)
    return c.json(page, 200)
  })

  api.openapi(routes.getRail, async (c) => {
    const { railId } = c.req.valid('param')
    const data = await getRail(c.var.db, c.var.network.schemas, railId)
    if (!data) throw notFound('Rail', railId)
    return c.json({ data }, 200)
  })

  api.openapi(routes.listRailSettlements, async (c) => {
    const { railId } = c.req.valid('param')
    const q = c.req.valid('query')
    const page = await listRailSettlements(c.var.db, c.var.network.schemas, {
      ...q,
      railId,
    })
    return c.json(page, 200)
  })

  api.openapi(routes.listSessionKeys, async (c) => {
    const q = c.req.valid('query')
    const page = await listSessionKeys(c.var.db, c.var.network.schemas, {
      ...q,
      now: Math.floor(Date.now() / 1000),
    })
    return c.json(page, 200)
  })

  api.openapi(routes.listSessionKeyEvents, async (c) => {
    const q = c.req.valid('query')
    const page = await listSessionKeyEvents(c.var.db, c.var.network.schemas, q)
    return c.json(page, 200)
  })

  return api
}
