import { type Db, ident, type Row, Where } from '../db.ts'
import { notFound } from '../errors.ts'
import type { Schemas } from '../networks.ts'
import { decodeCursor, type Page, toPage } from '../pagination.ts'
import type { Piece, PieceWithDataSet } from '../schemas/resources.ts'
import { addr, bool, json, req, str } from './map.ts'

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

const COLUMNS = `p.data_set_id, p.piece_id, p.cid, p.raw_size, p.metadata,
  p.removed, p.added_at_block, p.removed_at_block, p.updated_at_block`

/** Schema-qualified `pieces` view. */
function pieces(schemas: Schemas) {
  return `${ident(schemas.repair)}.pieces`
}

/** Map a `pieces` row to the API shape. */
function mapPiece(row: Row): Piece {
  return {
    dataSetId: req(row.data_set_id),
    pieceId: req(row.piece_id),
    cid: str(row.cid),
    rawSize: str(row.raw_size),
    metadata: json(row.metadata),
    removed: bool(row.removed),
    addedAtBlock: str(row.added_at_block),
    removedAtBlock: str(row.removed_at_block),
    updatedAtBlock: str(row.updated_at_block),
  }
}

/** Map a joined piece and data set row to the API shape. */
function mapPieceWithDataSet(row: Row): PieceWithDataSet {
  return {
    ...mapPiece(row),
    owner: addr(row.payer),
    providerId: str(row.provider_id),
  }
}

/** List pieces in one data set, newest piece first. */
export async function listDataSetPieces(
  db: Db,
  schemas: Schemas,
  params: ListDataSetPiecesParams
): Promise<Page<Piece>> {
  const where = new Where()
    .add((p) => `p.data_set_id = ${p}::bigint`, params.dataSetId)
    .maybe(params.removed, (p) => `p.removed = ${p}`)
  if (params.cursor) {
    const [id] = decodeCursor(params.cursor, ['int8'])
    where.add((p) => `p.piece_id < ${p}::bigint`, id)
  }
  const limit = where.param(params.limit + 1)
  const rows = await db.query(
    `select ${COLUMNS} from ${pieces(schemas)} p ${where}
     order by p.piece_id desc limit ${limit}`,
    where.params
  )
  return toPage(rows, params.limit, mapPiece, (r) => [req(r.piece_id)])
}

/** Get one piece by data set and piece id; throws 404 when missing. */
export async function getPiece(
  db: Db,
  schemas: Schemas,
  dataSetId: string,
  pieceId: string
): Promise<Piece> {
  const rows = await db.query(
    `select ${COLUMNS} from ${pieces(schemas)} p
     where p.data_set_id = $1::bigint and p.piece_id = $2::bigint`,
    [dataSetId, pieceId]
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
  const where = new Where()
    .maybe(params.owner, (p) => `d.payer = ${p}`)
    .maybe(params.cid, (p) => `p.cid = ${p}`)
    .maybe(params.provider_id, (p) => `d.provider_id = ${p}::bigint`)
    .maybe(params.removed, (p) => `p.removed = ${p}`)
  if (params.cursor) {
    const [dataSetId, pieceId] = decodeCursor(params.cursor, ['int8', 'int8'])
    where.add(
      (a, b) => `(p.data_set_id, p.piece_id) < (${a}::bigint, ${b}::bigint)`,
      dataSetId,
      pieceId
    )
  }
  const limit = where.param(params.limit + 1)
  const rows = await db.query(
    `select ${COLUMNS}, d.payer, d.provider_id
     from ${pieces(schemas)} p
     join ${ident(schemas.repair)}.data_sets d on d.data_set_id = p.data_set_id
     ${where}
     order by p.data_set_id desc, p.piece_id desc limit ${limit}`,
    where.params
  )
  return toPage(rows, params.limit, mapPieceWithDataSet, (r) => [
    req(r.data_set_id),
    req(r.piece_id),
  ])
}
