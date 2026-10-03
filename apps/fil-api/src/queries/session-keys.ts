import { type Db, logIndex } from '../db.ts'
import type { Schemas } from '../networks.ts'
import { decodeCursor, type Page, toPage } from '../pagination.ts'
import type { SessionKey, SessionKeyEvent } from '../schemas/resources.ts'
import { ident, sql, where } from '../sql.ts'
import { reqAddr } from './map.ts'

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

/** A session key folded by {@link listSessionKeys}' SQL. */
interface SessionKeyRow {
  identity: string
  signer: string
  expiry: string
  updated_at_block: string
  permissions: PermissionRow[]
}

/** An `skr_authorizations_updated` row with its log index. */
interface SessionKeyEventRow {
  log_index: number
  identity: string
  signer: string
  expiry: string
  /** JSON-encoded array of permission typehashes. */
  permissions: string | null
  origin: string
  block_number: string
  timestamp: string
  tx_hash: string
}

/** Map an aggregated session key row to the API shape. */
export function mapSessionKey(row: SessionKeyRow, now: number): SessionKey {
  const permissions = row.permissions.map((p) => ({
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
    expiry: row.expiry,
    updatedAtBlock: row.updated_at_block,
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
  // Pages split on (identity, signer), so the cursor can filter events
  // before they are folded.
  const [identity, signer] = params.cursor
    ? decodeCursor(params.cursor, ['address', 'address'])
    : []
  const rows = await db.query<SessionKeyRow>(
    sql`with latest as (
       select distinct on (s.identity, s.signer, p.permission)
         s.identity, s.signer, p.permission, s.expiry, s.origin,
         s.block_number, s.tx_hash
       from ${ident(schemas.observer)}.skr_authorizations_updated s
       cross join lateral jsonb_array_elements_text(s.permissions::jsonb)
         as p(permission)
       ${where([
         params.identity !== undefined && sql`s.identity = ${params.identity}`,
         params.signer !== undefined && sql`s.signer = ${params.signer}`,
         identity !== undefined &&
           sql`(s.identity, s.signer) > (${identity}, ${signer})`,
       ])}
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
     ${where(
       [
         params.active !== undefined &&
           sql`(max(expiry) > ${now}::numeric) = ${params.active}`,
       ],
       'having'
     )}
     order by identity, signer limit ${params.limit + 1}`
  )
  return toPage(
    rows,
    params.limit,
    (r) => mapSessionKey(r, now),
    (r) => [r.identity, r.signer]
  )
}

/** Parse the JSON-encoded permissions column. */
function parsePermissions(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '')
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** Map an `skr_authorizations_updated` row to the API shape. */
function mapSessionKeyEvent(row: SessionKeyEventRow): SessionKeyEvent {
  return {
    identity: reqAddr(row.identity),
    signer: reqAddr(row.signer),
    expiry: row.expiry,
    permissions: parsePermissions(row.permissions),
    origin: row.origin || null,
    blockNumber: row.block_number,
    timestamp: Number(row.timestamp),
    txHash: row.tx_hash,
  }
}

/** List raw session key authorization events, newest first. */
export async function listSessionKeyEvents(
  db: Db,
  schemas: Schemas,
  params: ListSessionKeyEventsParams
): Promise<Page<SessionKeyEvent>> {
  const [block, index] = params.cursor
    ? decodeCursor(params.cursor, ['int8', 'int8'])
    : []
  const rows = await db.query<SessionKeyEventRow>(
    sql`select ${logIndex()} as log_index, identity, signer, expiry, permissions,
       origin, block_number, timestamp, tx_hash
     from ${ident(schemas.observer)}.skr_authorizations_updated ${where([
       params.identity !== undefined && sql`identity = ${params.identity}`,
       params.signer !== undefined && sql`signer = ${params.signer}`,
       block !== undefined &&
         sql`(block_number, ${logIndex()}) < (${block}::numeric, ${index}::int)`,
     ])}
     order by block_number desc, log_index desc limit ${params.limit + 1}`
  )
  return toPage(rows, params.limit, mapSessionKeyEvent, (r) => [
    r.block_number,
    String(r.log_index),
  ])
}
