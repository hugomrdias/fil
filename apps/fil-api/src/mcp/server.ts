import { z } from '@hono/zod-openapi'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { DbFactory, DbStats } from '../db.ts'
import { ApiError, networkUnavailable, notFound } from '../errors.ts'
import {
  type Bindings,
  type NetworkDb,
  type NetworkName,
  openNetworkDb,
} from '../networks.ts'
import { getDataSet, listDataSets } from '../queries/data-sets.ts'
import { getPiece, listDataSetPieces, listPieces } from '../queries/pieces.ts'
import { getProvider, listProviders } from '../queries/providers.ts'
import { getRail, listRailSettlements, listRails } from '../queries/rails.ts'
import {
  listSessionKeyEvents,
  listSessionKeys,
} from '../queries/session-keys.ts'
import { getStatus } from '../queries/status.ts'
import { NetworkSchema, PageQuery, UintInput } from '../schemas/common.ts'
import {
  filters,
  hasPieceSelector,
  PIECE_SELECTOR_MESSAGE,
} from '../schemas/queries.ts'

/** Dependencies for one MCP request. */
export interface McpContext {
  env: Bindings
  dbFactory: DbFactory
  dbStats: DbStats
  version: string
}

/** MCP server plus a function that closes the database clients it opened. */
export interface McpHandle {
  server: McpServer
  closeDbs: () => Promise<void>
}

const base = {
  network: NetworkSchema.describe('Filecoin network: calibration or mainnet'),
}
const page = PageQuery.shape
const bool = z.boolean()

/**
 * Build a stateless MCP server exposing read-only Filecoin onchain data
 * tools. Database clients are opened per network on first use and closed
 * after the request.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools
 */
export function buildMcpServer(ctx: McpContext): McpHandle {
  const server = new McpServer(
    { name: 'fil-api', version: ctx.version },
    {
      instructions:
        'Read-only Filecoin Onchain Cloud data: storage providers, data sets, pieces, Filecoin Pay rails and session keys. Every tool takes a `network` (calibration or mainnet). Large integers are decimal strings. Paginate with `cursor` from `nextCursor`.',
    }
  )
  const opened = new Map<NetworkName, NetworkDb>()

  /** Open a network's database once per request, on first tool use. */
  function use(name: NetworkName): NetworkDb {
    let n = opened.get(name)
    if (!n) {
      n = openNetworkDb(ctx.env, name, ctx.dbFactory, ctx.dbStats)
      if (!n) throw networkUnavailable(name)
      opened.set(name, n)
    }
    return n
  }

  /** Register a read-only tool whose handler returns JSON. */
  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    run: (args: z.output<z.ZodObject<S>>) => Promise<unknown>
  ) {
    server.registerTool(
      name,
      {
        description,
        inputSchema: z.object(shape),
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      // biome-ignore lint/suspicious/noExplicitAny: SDK infers args from the schema
      (async (args: any): Promise<CallToolResult> => {
        try {
          const result = await run(args)
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result as Record<string, unknown>,
          }
        } catch (error) {
          if (error instanceof ApiError) {
            return {
              isError: true,
              content: [
                { type: 'text', text: `${error.code}: ${error.message}` },
              ],
            }
          }
          throw error
        }
      }) as never
    )
  }

  tool(
    'get_status',
    'Indexer status: chain id and latest, safe and finalized indexed blocks.',
    base,
    async ({ network }) => {
      const n = use(network)
      return { data: await getStatus(n.db, n.network) }
    }
  )

  tool(
    'list_providers',
    'List storage providers registered in the ServiceProviderRegistry.',
    { ...base, ...filters.providers(bool), ...page },
    ({ network, ...q }) => {
      const n = use(network)
      return listProviders(n.db, n.network.schemas, q)
    }
  )

  tool(
    'get_provider',
    'Get one storage provider by id.',
    { ...base, providerId: UintInput },
    async ({ network, providerId }) => {
      const n = use(network)
      const data = await getProvider(n.db, n.network.schemas, providerId)
      if (!data) throw notFound('Provider', providerId)
      return { data }
    }
  )

  tool(
    'list_data_sets',
    'List Warm Storage data sets, filtered by owner (paying client), provider, deleted or CDN.',
    { ...base, ...filters.dataSets(bool), ...page },
    ({ network, ...q }) => {
      const n = use(network)
      return listDataSets(n.db, n.network.schemas, q)
    }
  )

  tool(
    'get_data_set',
    'Get one data set by id.',
    { ...base, dataSetId: UintInput },
    async ({ network, dataSetId }) => {
      const n = use(network)
      const data = await getDataSet(n.db, n.network.schemas, dataSetId)
      if (!data) throw notFound('Data set', dataSetId)
      return { data }
    }
  )

  tool(
    'list_data_set_pieces',
    'List pieces in one data set, newest first.',
    { ...base, dataSetId: UintInput, ...filters.dataSetPieces(bool), ...page },
    ({ network, ...q }) => {
      const n = use(network)
      return listDataSetPieces(n.db, n.network.schemas, q)
    }
  )

  tool(
    'get_piece',
    'Get one piece by data set id and piece id.',
    { ...base, dataSetId: UintInput, pieceId: UintInput },
    async ({ network, dataSetId, pieceId }) => {
      const n = use(network)
      const data = await getPiece(n.db, n.network.schemas, dataSetId, pieceId)
      if (!data) throw notFound('Piece', `${dataSetId}/${pieceId}`)
      return { data }
    }
  )

  tool(
    'list_pieces',
    'Find pieces across data sets by owner (paying client), PieceCID or provider. Requires at least one of owner, cid or provider_id.',
    { ...base, ...filters.pieces(bool), ...page },
    ({ network, ...q }) => {
      if (!hasPieceSelector(q)) {
        throw new ApiError(400, 'invalid_request', PIECE_SELECTOR_MESSAGE)
      }
      const n = use(network)
      return listPieces(n.db, n.network.schemas, q)
    }
  )

  tool(
    'list_rails',
    'List Filecoin Pay payment rails with current rate, lockup, state and settlement totals.',
    { ...base, ...filters.rails(), ...page },
    ({ network, ...q }) => {
      const n = use(network)
      return listRails(n.db, n.network.schemas, q)
    }
  )

  tool(
    'get_rail',
    'Get one payment rail by id with its current state.',
    { ...base, railId: UintInput },
    async ({ network, railId }) => {
      const n = use(network)
      const data = await getRail(n.db, n.network.schemas, railId)
      if (!data) throw notFound('Rail', railId)
      return { data }
    }
  )

  tool(
    'list_rail_settlements',
    'List settlements of one payment rail, newest first.',
    { ...base, railId: UintInput, ...page },
    ({ network, ...q }) => {
      const n = use(network)
      return listRailSettlements(n.db, n.network.schemas, q)
    }
  )

  tool(
    'list_session_keys',
    'List session keys with the latest expiry of each permission per (identity, signer).',
    { ...base, ...filters.sessionKeys(bool), ...page },
    ({ network, ...q }) => {
      const n = use(network)
      return listSessionKeys(n.db, n.network.schemas, {
        ...q,
        now: Math.floor(Date.now() / 1000),
      })
    }
  )

  tool(
    'list_session_key_events',
    'List raw session key authorization events, newest first.',
    { ...base, ...filters.sessionKeyEvents(), ...page },
    ({ network, ...q }) => {
      const n = use(network)
      return listSessionKeyEvents(n.db, n.network.schemas, q)
    }
  )

  return {
    server,
    closeDbs: async () => {
      await Promise.all([...opened.values()].map((n) => n.close()))
    },
  }
}
