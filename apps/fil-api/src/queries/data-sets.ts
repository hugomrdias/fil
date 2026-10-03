import type { Db } from '../db.ts'
import { notFound } from '../errors.ts'
import type { Schemas } from '../networks.ts'
import { decodeCursor, type Page, toPage } from '../pagination.ts'
import type { DataSet } from '../schemas/resources.ts'
import { ident, raw, sql, where } from '../sql.ts'
import { addr } from './map.ts'

/**
 * Filters for {@link listDataSets}, named like the API query parameters so
 * REST and MCP input passes through unchanged.
 */
export interface ListDataSetsParams {
  owner?: string
  provider_id?: string
  deleted?: boolean
  with_cdn?: boolean
  limit: number
  cursor?: string
}

/** A `data_sets` row. */
interface DataSetRow {
  data_set_id: string
  provider_id: string
  payer: string
  source: string | null
  metadata: Record<string, unknown> | null
  with_cdn: boolean
  with_ipfs_indexing: boolean
  pdp_end_epoch: string | null
  deleted: boolean
  created_at_block: string
  updated_at_block: string
}

const COLUMNS =
  raw(`data_set_id, provider_id, payer, source, metadata, with_cdn,
  with_ipfs_indexing, pdp_end_epoch, deleted, created_at_block,
  updated_at_block`)

/** Schema-qualified `data_sets` view. */
function table(schemas: Schemas) {
  return sql`${ident(schemas.repair)}.data_sets`
}

/** Map a `data_sets` row to the API shape. */
function mapDataSet(row: DataSetRow): DataSet {
  return {
    dataSetId: row.data_set_id,
    providerId: row.provider_id,
    owner: addr(row.payer),
    source: row.source || null,
    metadata: row.metadata,
    withCdn: row.with_cdn,
    withIpfsIndexing: row.with_ipfs_indexing,
    pdpEndEpoch: row.pdp_end_epoch,
    deleted: row.deleted,
    createdAtBlock: row.created_at_block,
    updatedAtBlock: row.updated_at_block,
  }
}

/** List data sets, newest id first. `owner` matches the paying client. */
export async function listDataSets(
  db: Db,
  schemas: Schemas,
  params: ListDataSetsParams
): Promise<Page<DataSet>> {
  const [id] = params.cursor ? decodeCursor(params.cursor, ['int8']) : []
  const rows = await db.query<DataSetRow>(
    sql`select ${COLUMNS} from ${table(schemas)} ${where([
      params.owner !== undefined && sql`payer = ${params.owner}`,
      params.provider_id !== undefined &&
        sql`provider_id = ${params.provider_id}::bigint`,
      params.deleted !== undefined && sql`deleted = ${params.deleted}`,
      params.with_cdn !== undefined && sql`with_cdn = ${params.with_cdn}`,
      id !== undefined && sql`data_set_id < ${id}::bigint`,
    ])}
     order by data_set_id desc limit ${params.limit + 1}`
  )
  return toPage(rows, params.limit, mapDataSet, (r) => [r.data_set_id])
}

/** Get one data set by id; throws 404 when it does not exist. */
export async function getDataSet(
  db: Db,
  schemas: Schemas,
  dataSetId: string
): Promise<DataSet> {
  const rows = await db.query<DataSetRow>(
    sql`select ${COLUMNS} from ${table(schemas)}
     where data_set_id = ${dataSetId}::bigint`
  )
  if (!rows[0]) throw notFound('Data set', dataSetId)
  return mapDataSet(rows[0])
}
