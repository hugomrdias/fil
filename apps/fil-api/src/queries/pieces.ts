import type { Db } from '../db.ts'
import { notFound } from '../errors.ts'
import type { Schemas } from '../networks.ts'
import { decodeCursor, type Page, toPage } from '../pagination.ts'
import type { Piece, PieceWithDataSet } from '../schemas/resources.ts'
import { ident, raw, sql, where } from '../sql.ts'
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
