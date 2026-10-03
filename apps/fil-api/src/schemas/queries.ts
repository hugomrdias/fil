import { z } from '@hono/zod-openapi'
import { Address, BooleanQuery, PageQuery, UintInput } from './common.ts'
import { RailStateSchema } from './resources.ts'

type Bool = typeof BooleanQuery | z.ZodBoolean

/**
 * Filter fields shared by REST query strings and MCP tool input. Factories
 * take the boolean schema: REST passes {@link BooleanQuery}, MCP
 * `z.boolean()`.
 */
export const filters = {
  providers: <B extends Bool>(bool: B) => ({
    approved: bool.optional().describe('Approved for Warm Storage'),
    active: bool.optional().describe('Active in the provider registry'),
    endorsed: bool.optional().describe('Endorsed provider'),
  }),
  dataSets: <B extends Bool>(bool: B) => ({
    owner: Address.optional().describe('Client address that owns the data set'),
    provider_id: UintInput.optional().describe('Storage provider id'),
    deleted: bool.optional().describe('Deleted data sets'),
    with_cdn: bool.optional().describe('Data sets with CDN enabled'),
  }),
  dataSetPieces: <B extends Bool>(bool: B) => ({
    removed: bool.optional().describe('Removed pieces'),
  }),
  pieces: <B extends Bool>(bool: B) => ({
    owner: Address.optional().describe('Client address that owns the data set'),
    cid: z.string().min(1).max(256).optional().describe('PieceCID'),
    provider_id: UintInput.optional().describe('Storage provider id'),
    removed: bool.optional().describe('Removed pieces'),
  }),
  rails: {
    payer: Address.optional().describe('Payer address'),
    payee: Address.optional().describe('Payee address'),
    operator: Address.optional().describe('Operator contract address'),
    token: Address.optional().describe('Payment token address'),
    state: RailStateSchema.optional(),
  },
  sessionKeys: <B extends Bool>(bool: B) => ({
    identity: Address.optional().describe('Identity that authorized the key'),
    signer: Address.optional().describe('Session key signer address'),
    active: bool.optional().describe('Keys with any unexpired permission'),
  }),
  sessionKeyEvents: {
    identity: Address.optional().describe('Identity that authorized the key'),
    signer: Address.optional().describe('Session key signer address'),
  },
}

/** Require at least one selector for a cross-data-set piece lookup. */
export function hasPieceSelector(q: {
  owner?: string
  cid?: string
  provider_id?: string
}) {
  return (
    q.owner !== undefined || q.cid !== undefined || q.provider_id !== undefined
  )
}

/** Message for {@link hasPieceSelector} failures. */
export const PIECE_SELECTOR_MESSAGE =
  'Provide at least one of owner, cid or provider_id'

/** `GET /{network}/providers` query. */
export const ListProvidersQuery = PageQuery.extend(
  filters.providers(BooleanQuery)
)

/** `GET /{network}/data-sets` query. */
export const ListDataSetsQuery = PageQuery.extend(
  filters.dataSets(BooleanQuery)
)

/** `GET /{network}/data-sets/{dataSetId}/pieces` query. */
export const ListDataSetPiecesQuery = PageQuery.extend(
  filters.dataSetPieces(BooleanQuery)
)

/** `GET /{network}/pieces` query. */
export const ListPiecesQuery = PageQuery.extend(
  filters.pieces(BooleanQuery)
).refine(hasPieceSelector, { message: PIECE_SELECTOR_MESSAGE })

/** `GET /{network}/rails` query. */
export const ListRailsQuery = PageQuery.extend(filters.rails)

/** `GET /{network}/session-keys` query. */
export const ListSessionKeysQuery = PageQuery.extend(
  filters.sessionKeys(BooleanQuery)
)

/** `GET /{network}/session-keys/history` query. */
export const ListSessionKeyEventsQuery = PageQuery.extend(
  filters.sessionKeyEvents
)
