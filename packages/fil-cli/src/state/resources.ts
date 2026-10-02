import type { DatabaseSync } from 'node:sqlite'
import { decodeCursor, encodeCursor, type Page } from './cursor.ts'

/** One on-chain storage occurrence of a resource. IDs are decimal strings. */
export type Copy = {
  providerId: string
  dataSetId: string
  pieceId: string
  /** Provider retrieval endpoint, cached from the registry at upload time. */
  serviceURL: string
}

/** Lifecycle state of a managed resource. */
export type ResourceStatus = 'active' | 'removal_pending'

/**
 * A file or artifact managed by this CLI. A file stores original bytes; an
 * artifact stores a UnixFS CAR and adds an IPFS root CID.
 *
 * @see ../../../../docs/fil-cli-interface-research.md#resources
 */
export type Resource = {
  ref: string
  kind: 'file' | 'artifact'
  name: string
  chainId: string
  payer: string
  pieceCid: string
  rootCid?: string
  size: number
  copies: Copy[]
  url?: string
  status: ResourceStatus
  createdAt: string
}

/** Row shape of the `resources` table. */
type ResourceRow = {
  ref: string
  kind: 'file' | 'artifact'
  name: string
  chain_id: string
  payer: string
  piece_cid: string
  root_cid: string | null
  size: number
  copies: string
  url: string | null
  status: ResourceStatus
  created_at: string
}

/** Convert a database row to a {@link Resource}. */
function fromRow(row: ResourceRow): Resource {
  return {
    ref: row.ref,
    kind: row.kind,
    name: row.name,
    chainId: row.chain_id,
    payer: row.payer,
    pieceCid: row.piece_cid,
    ...(row.root_cid ? { rootCid: row.root_cid } : {}),
    size: row.size,
    copies: JSON.parse(row.copies) as Copy[],
    ...(row.url ? { url: row.url } : {}),
    status: row.status,
    createdAt: row.created_at,
  }
}

/** Insert or replace a resource. */
export function saveResource(db: DatabaseSync, resource: Resource): void {
  db.prepare(
    `INSERT OR REPLACE INTO resources
      (ref, kind, name, chain_id, payer, piece_cid, root_cid, size, copies, url, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    resource.ref,
    resource.kind,
    resource.name,
    resource.chainId,
    resource.payer,
    resource.pieceCid,
    resource.rootCid ?? null,
    resource.size,
    JSON.stringify(resource.copies),
    resource.url ?? null,
    resource.status,
    resource.createdAt
  )
}

/** Get a resource by reference. */
export function getResource(
  db: DatabaseSync,
  ref: string
): Resource | undefined {
  const row = db.prepare('SELECT * FROM resources WHERE ref = ?').get(ref) as
    | ResourceRow
    | undefined
  return row ? fromRow(row) : undefined
}

/** Find resources in an account scope whose PieceCID or root CID matches. */
export function findResourcesByCid(
  db: DatabaseSync,
  scope: { chainId: string; payer: string },
  cid: string
): Resource[] {
  const rows = db
    .prepare(
      `SELECT * FROM resources
       WHERE chain_id = ? AND payer = ? AND (piece_cid = ? OR root_cid = ?)
       ORDER BY created_at DESC`
    )
    .all(scope.chainId, scope.payer, cid, cid) as ResourceRow[]
  return rows.map(fromRow)
}

/** Options for {@link listResources}. */
export type ListResourcesOptions = {
  chainId: string
  payer: string
  limit: number
  /** `nextCursor` of the previous page. */
  cursor?: string | undefined
  /** Include resources pending removal. */
  all?: boolean
}

/** List resources for an account scope, newest first, one page at a time. */
export function listResources(
  db: DatabaseSync,
  options: ListResourcesOptions
): Page<Resource> {
  const after = options.cursor ? decodeCursor(options.cursor) : undefined
  const rows = db
    .prepare(
      `SELECT * FROM resources
       WHERE chain_id = ? AND payer = ? ${options.all ? '' : "AND status = 'active'"}
       ${after ? 'AND (created_at, ref) < (?, ?)' : ''}
       ORDER BY created_at DESC, ref DESC
       LIMIT ?`
    )
    .all(
      options.chainId,
      options.payer,
      ...(after ?? []),
      options.limit + 1
    ) as ResourceRow[]
  const items = rows.slice(0, options.limit).map(fromRow)
  const last = items.at(-1)
  return rows.length > options.limit && last
    ? { items, nextCursor: encodeCursor(last.createdAt, last.ref) }
    : { items }
}

/** Update a resource's lifecycle status. */
export function setResourceStatus(
  db: DatabaseSync,
  ref: string,
  status: ResourceStatus
): void {
  db.prepare('UPDATE resources SET status = ? WHERE ref = ?').run(status, ref)
}
