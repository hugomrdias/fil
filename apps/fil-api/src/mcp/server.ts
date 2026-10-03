import { z } from '@hono/zod-openapi'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Db, DbFactory, DbStats } from '../db.ts'
import { networkUnavailable, toErrorResponse } from '../errors.ts'
import { log } from '../log.ts'
import {
  type Bindings,
  type Network,
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
  requestId?: string
}

/** MCP server plus a function that closes the database clients it opened. */
export interface McpHandle {
  server: McpServer
  closeDbs: () => Promise<void>
}

/** Tool input schema: a `network` plus tool-specific fields. */
type ToolSchema = z.ZodObject<{ network: typeof NetworkSchema }>

/** A read-only tool, defined once and registered on each request's server. */
interface ToolDef {
  name: string
  description: string
  inputSchema: ToolSchema
  run: (
    db: Db,
    network: Network,
    args: Record<string, unknown>
  ) => Promise<unknown>
}

/** Build a tool input schema from tool-specific fields. */
function input<S extends z.ZodRawShape>(shape: S) {
  return z.object({
    network: NetworkSchema.describe('Filecoin network: calibration or mainnet'),
    ...shape,
  })
}

/** Define a tool; `run` receives the parsed input without `network`. */
function defineTool<S extends ToolSchema>(
  name: string,
  description: string,
  inputSchema: S,
  run: (
    db: Db,
    network: Network,
    args: Omit<z.output<S>, 'network'>
  ) => Promise<unknown>
): ToolDef {
  return { name, description, inputSchema, run: run as ToolDef['run'] }
}

const page = PageQuery.shape
const bool = z.boolean()

/** Tool definitions, built once per isolate. */
const TOOLS: ToolDef[] = [
  defineTool(
    'get_status',
    'Indexer status: chain id and latest, safe and finalized indexed blocks.',
    input({}),
    async (db, network) => ({ data: await getStatus(db, network) })
  ),
  defineTool(
    'list_providers',
    'List storage providers registered in the ServiceProviderRegistry.',
    input({ ...filters.providers(bool), ...page }),
    (db, network, q) => listProviders(db, network.schemas, q)
  ),
  defineTool(
    'get_provider',
    'Get one storage provider by id.',
    input({ providerId: UintInput }),
    async (db, network, q) => ({
      data: await getProvider(db, network.schemas, q.providerId),
    })
  ),
  defineTool(
    'list_data_sets',
    'List Warm Storage data sets, filtered by owner (paying client), provider, deleted or CDN.',
    input({ ...filters.dataSets(bool), ...page }),
    (db, network, q) => listDataSets(db, network.schemas, q)
  ),
  defineTool(
    'get_data_set',
    'Get one data set by id.',
    input({ dataSetId: UintInput }),
    async (db, network, q) => ({
      data: await getDataSet(db, network.schemas, q.dataSetId),
    })
  ),
  defineTool(
    'list_data_set_pieces',
    'List pieces in one data set, newest first.',
    input({ dataSetId: UintInput, ...filters.dataSetPieces(bool), ...page }),
    (db, network, q) => listDataSetPieces(db, network.schemas, q)
  ),
  defineTool(
    'get_piece',
    'Get one piece by data set id and piece id.',
    input({ dataSetId: UintInput, pieceId: UintInput }),
    async (db, network, q) => ({
      data: await getPiece(db, network.schemas, q.dataSetId, q.pieceId),
    })
  ),
  defineTool(
    'list_pieces',
    'Find pieces across data sets by owner (paying client), PieceCID or provider. Requires at least one of owner, cid or provider_id.',
    input({ ...filters.pieces(bool), ...page }).refine(hasPieceSelector, {
      message: PIECE_SELECTOR_MESSAGE,
    }),
    (db, network, q) => listPieces(db, network.schemas, q)
  ),
  defineTool(
    'list_rails',
    'List Filecoin Pay payment rails with current rate, lockup, state and settlement totals.',
    input({ ...filters.rails, ...page }),
    (db, network, q) => listRails(db, network.schemas, q)
  ),
  defineTool(
    'get_rail',
    'Get one payment rail by id with its current state.',
    input({ railId: UintInput }),
    async (db, network, q) => ({
      data: await getRail(db, network.schemas, q.railId),
    })
  ),
  defineTool(
    'list_rail_settlements',
    'List settlements of one payment rail, newest first.',
    input({ railId: UintInput, ...page }),
    (db, network, q) => listRailSettlements(db, network.schemas, q)
  ),
  defineTool(
    'list_session_keys',
    'List session keys with the latest expiry of each permission per (identity, signer).',
    input({ ...filters.sessionKeys(bool), ...page }),
    (db, network, q) => listSessionKeys(db, network.schemas, q)
  ),
  defineTool(
    'list_session_key_events',
    'List raw session key authorization events, newest first.',
    input({ ...filters.sessionKeyEvents, ...page }),
    (db, network, q) => listSessionKeyEvents(db, network.schemas, q)
  ),
]

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

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      // biome-ignore lint/suspicious/noExplicitAny: SDK infers args from the schema
      (async ({ network, ...args }: any): Promise<CallToolResult> => {
        try {
          const n = use(network)
          const result = await tool.run(n.db, n.network, args)
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result as Record<string, unknown>,
          }
        } catch (error) {
          const { body, unexpected } = toErrorResponse(error)
          if (unexpected) {
            log('error', {
              message: 'unhandled tool error',
              requestId: ctx.requestId,
              tool: tool.name,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            })
          }
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `${body.error.code}: ${body.error.message}`,
              },
            ],
          }
        }
      }) as never
    )
  }

  return {
    server,
    closeDbs: async () => {
      await Promise.all([...opened.values()].map((n) => n.close()))
    },
  }
}
