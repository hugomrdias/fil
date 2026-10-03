import { type Db, ident, logIndex, type Row, Where } from '../db.ts'
import type { Schemas } from '../networks.ts'
import { decodeCursor, type Page, toPage } from '../pagination.ts'
import type { SessionKey, SessionKeyEvent } from '../schemas/resources.ts'
import { num, req, reqAddr, str } from './map.ts'

/**
 * Names of known Warm Storage EIP-712 typehashes used as session key
 * permissions, including typehashes from earlier synapse-core releases that
 * still appear in onchain authorizations.
 *
 * @see https://github.com/FilOzone/synapse-sdk/blob/main/packages/synapse-core/src/session-key/permissions.ts
 */
const PERMISSION_NAMES: Readonly<Record<string, string>> = {
  // CreateDataSet(uint256 clientDataSetId,address payee,MetadataEntry[] metadata)...
  '0x25ebf20299107c91b4624d5bac3a16d32cabf0db23b450ee09ab7732983b1dc9':
    'CreateDataSet',
  // AddPieces(uint256 clientDataSetId,uint256 nonce,Cid[] pieceData,PieceMetadata[] pieceMetadata)...
  '0x954bdc254591a7eab1b73f03842464d9283a08352772737094d710a4428fd183':
    'AddPieces',
  // AddPieces(uint256 clientDataSetId,uint256 firstAdded,...) before random nonces
  '0xb557d81ec3b03a60fa3cc207f13ad04af6c95850e1955114d0a0f40919e49ffd':
    'AddPieces',
  // SchedulePieceRemovals(uint256 clientDataSetId,uint256[] pieceIds)
  '0x5415701e313bb627e755b16924727217bb356574fe20e7061442c200b0822b22':
    'SchedulePieceRemovals',
  // TerminateService(uint256 dataSetId)
  '0x522bd88a11de1cdc6574394dde7a21ae488ff13e16e7408d0ea721dd8479dffc':
    'TerminateService',
  // DeleteDataSet(uint256 dataSetId), renamed to TerminateService
  '0xb0988e9a1e5723860e0f59e0469113fb8a0ce9e83f8a1dd9109527eaad225b37':
    'DeleteDataSet',
  // DeleteDataSet(uint256 clientDataSetId), the original typehash
  '0xb5d6b3fc97881f05e96958136ac09d7e0bc7cbf17ea92fce7c431d88132d2b58':
    'DeleteDataSet',
}

/** Filters for {@link listSessionKeys}. */
export interface ListSessionKeysParams {
  identity?: string
  signer?: string
  active?: boolean
  /** Unix time in seconds used to evaluate expiry; defaults to now. */
  now?: number
  limit: number
  cursor?: string
}

/** Filters for {@link listSessionKeyEvents}. */
export interface ListSessionKeyEventsParams {
  identity?: string
  signer?: string
  limit: number
  cursor?: string
}

/** One permission entry as aggregated by {@link listSessionKeys}' SQL. */
interface PermissionRow {
  permission: string
  expiry: string
  origin: string | null
  blockNumber: string
  txHash: string
}

/** Map an aggregated session key row to the API shape. */
export function mapSessionKey(row: Row, now: number): SessionKey {
  const permissions = (row.permissions as PermissionRow[]).map((p) => ({
    permission: p.permission,
    name: PERMISSION_NAMES[p.permission] ?? null,
    expiry: p.expiry,
    active: Number(p.expiry) > now,
    origin: p.origin || null,
    blockNumber: p.blockNumber,
    txHash: p.txHash,
  }))
  return {
    identity: reqAddr(row.identity),
    signer: reqAddr(row.signer),
    active: permissions.some((p) => p.active),
    expiry: req(row.expiry),
    updatedAtBlock: req(row.updated_at_block),
    permissions,
  }
}

/**
 * List session keys with the latest expiry of each permission, folded from
 * `AuthorizationsUpdated` events per (identity, signer, permission).
 */
export async function listSessionKeys(
  db: Db,
  schemas: Schemas,
  params: ListSessionKeysParams
): Promise<Page<SessionKey>> {
  const now = params.now ?? Math.floor(Date.now() / 1000)
  const inner = new Where()
    .maybe(params.identity, (p) => `s.identity = ${p}`)
    .maybe(params.signer, (p) => `s.signer = ${p}`)
  if (params.cursor) {
    // Pages split on (identity, signer), so the cursor can filter events
    // before they are folded.
    const [identity, signer] = decodeCursor(params.cursor, [
      'address',
      'address',
    ])
    inner.add(
      (a, b) => `(s.identity, s.signer) > (${a}, ${b})`,
      identity,
      signer
    )
  }
  const having = new Where(inner.params)
  if (params.active !== undefined) {
    having.add(
      (now, active) => `(max(expiry) > ${now}::numeric) = ${active}`,
      now,
      params.active
    )
  }
  const limit = inner.param(params.limit + 1)
  const rows = await db.query(
    `with latest as (
       select distinct on (s.identity, s.signer, p.permission)
         s.identity, s.signer, p.permission, s.expiry, s.origin,
         s.block_number, s.tx_hash
       from ${ident(schemas.observer)}.skr_authorizations_updated s
       cross join lateral jsonb_array_elements_text(s.permissions::jsonb)
         as p(permission)
       ${inner}
       order by s.identity, s.signer, p.permission, s.block_number desc,
         ${logIndex('s')} desc
     )
     select identity, signer, max(expiry)::text as expiry,
       max(block_number)::text as updated_at_block,
       jsonb_agg(jsonb_build_object(
         'permission', permission, 'expiry', expiry::text, 'origin', origin,
         'blockNumber', block_number::text, 'txHash', tx_hash
       ) order by permission) as permissions
     from latest
     group by identity, signer
     ${having.render('having')}
     order by identity, signer limit ${limit}`,
    inner.params
  )
  return toPage(
    rows,
    params.limit,
    (r) => mapSessionKey(r, now),
    (r) => [req(r.identity), req(r.signer)]
  )
}

/** Parse the JSON-encoded permissions column. */
function parsePermissions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  try {
    const parsed: unknown = JSON.parse(String(value))
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** Map an `skr_authorizations_updated` row to the API shape. */
function mapSessionKeyEvent(row: Row): SessionKeyEvent {
  return {
    identity: reqAddr(row.identity),
    signer: reqAddr(row.signer),
    expiry: req(row.expiry),
    permissions: parsePermissions(row.permissions),
    origin: str(row.origin) || null,
    blockNumber: req(row.block_number),
    timestamp: num(row.timestamp),
    txHash: req(row.tx_hash),
  }
}

/** List raw session key authorization events, newest first. */
export async function listSessionKeyEvents(
  db: Db,
  schemas: Schemas,
  params: ListSessionKeyEventsParams
): Promise<Page<SessionKeyEvent>> {
  const where = new Where()
    .maybe(params.identity, (p) => `identity = ${p}`)
    .maybe(params.signer, (p) => `signer = ${p}`)
  if (params.cursor) {
    const [block, index] = decodeCursor(params.cursor, ['int8', 'int8'])
    where.add(
      (a, b) => `(block_number, ${logIndex()}) < (${a}::numeric, ${b}::int)`,
      block,
      index
    )
  }
  const limit = where.param(params.limit + 1)
  const rows = await db.query(
    `select ${logIndex()} as log_index, identity, signer, expiry, permissions,
       origin, block_number, timestamp, tx_hash
     from ${ident(schemas.observer)}.skr_authorizations_updated ${where}
     order by block_number desc, log_index desc limit ${limit}`,
    where.params
  )
  return toPage(rows, params.limit, mapSessionKeyEvent, (r) => [
    req(r.block_number),
    req(r.log_index),
  ])
}
