import { cidForms } from '../cid.ts'
import type { Db } from '../db.ts'
import { notFound } from '../errors.ts'
import type { Schemas } from '../networks.ts'
import { decodeCursor, type Page, toPage } from '../pagination.ts'
import type { Piece, PieceWithDataSet } from '../schemas/resources.ts'
import { ident, join, raw, type Sql, sql, where } from '../sql.ts'
import { addr } from './map.ts'

/** Filters for {@link listDataSetPieces}. */
export interface ListDataSetPiecesParams {
  dataSetId: string
  removed?: boolean
  limit: number
  cursor?: string
}

/**
 * Filters for {@link listPieces}, named like the API query parameters; at
 * least one of owner, cid or provider_id is required.
 */
export interface ListPiecesParams {
  owner?: string
  cid?: string
  provider_id?: string
  removed?: boolean
  limit: number
  cursor?: string
}

/** A `pieces` row. */
interface PieceRow {
  data_set_id: string
  piece_id: string
  cid: string
  raw_size: string
  metadata: Record<string, unknown> | null
  removed: boolean
  added_at_block: string
  removed_at_block: string | null
  updated_at_block: string
}

/** A `pieces` row joined with its data set's payer and provider. */
interface PieceWithDataSetRow extends PieceRow {
  payer: string
  provider_id: string
}

const COLUMNS = raw(`p.data_set_id, p.piece_id, p.cid, p.raw_size, p.metadata,
  p.removed, p.added_at_block, p.removed_at_block, p.updated_at_block`)

/** Schema-qualified `pieces` view. */
function pieces(schemas: Schemas) {
  return sql`${ident(schemas.repair)}.pieces`
}

/** Schema-qualified `data_sets` view. */
function dataSets(schemas: Schemas) {
  return sql`${ident(schemas.repair)}.data_sets`
}

/** Schema-qualified `providers` view. */
function providers(schemas: Schemas) {
  return sql`${ident(schemas.repair)}.providers`
}

/** Map a `pieces` row to the API shape. */
function mapPiece(row: PieceRow): Piece {
  return {
    dataSetId: row.data_set_id,
    pieceId: row.piece_id,
    cid: row.cid,
    rawSize: row.raw_size,
    metadata: row.metadata,
    removed: row.removed,
    addedAtBlock: row.added_at_block,
    removedAtBlock: row.removed_at_block,
    updatedAtBlock: row.updated_at_block,
  }
}

/** Map a joined piece and data set row to the API shape. */
function mapPieceWithDataSet(row: PieceWithDataSetRow): PieceWithDataSet {
  return {
    ...mapPiece(row),
    owner: addr(row.payer),
    providerId: row.provider_id,
  }
}

/** List pieces in one data set, newest piece first. */
export async function listDataSetPieces(
  db: Db,
  schemas: Schemas,
  params: ListDataSetPiecesParams
): Promise<Page<Piece>> {
  const [id] = params.cursor ? decodeCursor(params.cursor, ['int8']) : []
  const rows = await db.query<PieceRow>(
    sql`select ${COLUMNS} from ${pieces(schemas)} p ${where([
      sql`p.data_set_id = ${params.dataSetId}::bigint`,
      params.removed !== undefined && sql`p.removed = ${params.removed}`,
      id !== undefined && sql`p.piece_id < ${id}::bigint`,
    ])}
     order by p.piece_id desc limit ${params.limit + 1}`
  )
  return toPage(rows, params.limit, mapPiece, (r) => [r.piece_id])
}

/** Get one piece by data set and piece id; throws 404 when missing. */
export async function getPiece(
  db: Db,
  schemas: Schemas,
  dataSetId: string,
  pieceId: string
): Promise<Piece> {
  const rows = await db.query<PieceRow>(
    sql`select ${COLUMNS} from ${pieces(schemas)} p
     where p.data_set_id = ${dataSetId}::bigint
       and p.piece_id = ${pieceId}::bigint`
  )
  if (!rows[0]) throw notFound('Piece', `${dataSetId}/${pieceId}`)
  return mapPiece(rows[0])
}

/**
 * List pieces across data sets by owner, PieceCID or provider, newest first.
 * `owner` matches the data set's paying client.
 */
export async function listPieces(
  db: Db,
  schemas: Schemas,
  params: ListPiecesParams
): Promise<Page<PieceWithDataSet>> {
  const [dataSetId, pieceId] = params.cursor
    ? decodeCursor(params.cursor, ['int8', 'int8'])
    : []
  // Look up the matching data sets first and scan pieces only within them.
  // As a join filter the planner instead walks the whole pieces index in
  // order and keeps the few rows that match a small owner.
  const inDataSets =
    (params.owner !== undefined || params.provider_id !== undefined) &&
    sql`p.data_set_id = any(array(select data_set_id
         from ${dataSets(schemas)} ${where([
           params.owner !== undefined && sql`payer = ${params.owner}`,
           params.provider_id !== undefined &&
             sql`provider_id = ${params.provider_id}::bigint`,
           dataSetId !== undefined && sql`data_set_id <= ${dataSetId}::bigint`,
         ])}))`
  const rows = await db.query<PieceWithDataSetRow>(
    sql`select ${COLUMNS}, d.payer, d.provider_id
     from ${pieces(schemas)} p
     join ${dataSets(schemas)} d on d.data_set_id = p.data_set_id
     ${where([
       params.cid !== undefined && sql`p.cid = ${params.cid}`,
       params.removed !== undefined && sql`p.removed = ${params.removed}`,
       inDataSets,
       dataSetId !== undefined &&
         sql`(p.data_set_id, p.piece_id) < (${dataSetId}::bigint, ${pieceId}::bigint)`,
     ])}
     order by p.data_set_id desc, p.piece_id desc limit ${params.limit + 1}`
  )
  return toPage(rows, params.limit, mapPieceWithDataSet, (r) => [
    r.data_set_id,
    r.piece_id,
  ])
}

/** A storage provider serving a live copy of some content. */
export interface PieceProvider {
  providerId: string
  /** PDP service URL (Curio) of the provider. */
  serviceUrl: string
  /**
   * The copy's `ipfsRootCID` metadata when its data set is IPFS-indexed, so
   * the provider announces the content to the IPFS network. Unvalidated.
   */
  ipfsRootCid: string | null
}

/** A provider row from {@link findProvider}. */
interface PieceProviderRow {
  provider_id: string
  service_url: string
  ipfs_root_cid: string | null
}

/**
 * Find the best provider serving a live copy of the pieces matching `match`:
 * the piece is not removed, its data set not deleted, and the provider is
 * active with an HTTP service URL. Endorsed providers rank first, then
 * approved ones, then the oldest copy.
 */
async function findProvider(
  db: Db,
  schemas: Schemas,
  match: Sql
): Promise<PieceProvider | undefined> {
  const rows = await db.query<PieceProviderRow>(
    sql`select pr.provider_id, pr.service_url,
       case when d.with_ipfs_indexing then p.metadata->>'ipfsRootCID' end
         as ipfs_root_cid
     from ${pieces(schemas)} p
     join ${dataSets(schemas)} d on d.data_set_id = p.data_set_id
     join ${providers(schemas)} pr on pr.provider_id = d.provider_id
     where ${match}
       and not p.removed and not d.deleted
       and pr.provider_active and pr.pdp_product_active
       and pr.service_url ~ '^https?://'
     order by pr.endorsed desc, pr.approved desc, p.added_at_block asc
     limit 1`
  )
  const row = rows[0]
  return (
    row && {
      providerId: row.provider_id,
      serviceUrl: row.service_url,
      ipfsRootCid: row.ipfs_root_cid,
    }
  )
}

/** Find the provider to retrieve a PieceCID from, if any serves it. */
export function findPieceProvider(
  db: Db,
  schemas: Schemas,
  cid: string
): Promise<PieceProvider | undefined> {
  return findProvider(db, schemas, sql`p.cid = ${cid}`)
}

/**
 * Find the provider to retrieve IPFS content from by the `ipfsRootCID` piece
 * metadata key, matching CIDv0 and CIDv1 forms of the same root. Only
 * IPFS-indexed data sets are searched, and they are looked up first so the
 * metadata filter scans just their pieces.
 *
 * @see https://github.com/filecoin-project/curio/blob/main/documentation/en/curio-market/retrievals.md
 */
export function findIpfsRootProvider(
  db: Db,
  schemas: Schemas,
  rootCid: string
): Promise<PieceProvider | undefined> {
  return findProvider(
    db,
    schemas,
    sql`p.data_set_id = any(array(select data_set_id
         from ${dataSets(schemas)} where with_ipfs_indexing and not deleted))
       and p.metadata->>'ipfsRootCID' in (${join(
         cidForms(rootCid).map((form) => sql`${form}`),
         ', '
       )})`
  )
}
