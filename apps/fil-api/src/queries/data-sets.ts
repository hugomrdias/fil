import { type Db, ident, type Row, Where } from '../db.ts'
import type { Schemas } from '../networks.ts'
import { decodeCursor, type Page, toPage } from '../pagination.ts'
import type { DataSet } from '../schemas/resources.ts'
import { bool, json, req, str } from './map.ts'

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

const COLUMNS = `data_set_id, provider_id, payer, source, metadata, with_cdn,
  with_ipfs_indexing, pdp_end_epoch, deleted, created_at_block,
  updated_at_block`

/** Schema-qualified `data_sets` view. */
function table(schemas: Schemas) {
  return `${ident(schemas.repair)}.data_sets`
}

/** Map a `data_sets` row to the API shape. */
export function mapDataSet(row: Row): DataSet {
  return {
    dataSetId: req(row.data_set_id),
    providerId: str(row.provider_id),
    owner: str(row.payer),
    source: str(row.source) || null,
    metadata: json(row.metadata),
    withCdn: bool(row.with_cdn),
    withIpfsIndexing: bool(row.with_ipfs_indexing),
    pdpEndEpoch: str(row.pdp_end_epoch),
    deleted: bool(row.deleted),
    createdAtBlock: str(row.created_at_block),
    updatedAtBlock: str(row.updated_at_block),
  }
}

/** List data sets, newest id first. `owner` matches the paying client. */
export async function listDataSets(
  db: Db,
  schemas: Schemas,
  params: ListDataSetsParams
): Promise<Page<DataSet>> {
  const where = new Where()
    .maybe(params.owner?.toLowerCase(), (p) => `payer = ${p}`)
    .maybe(params.provider_id, (p) => `provider_id = ${p}::bigint`)
    .maybe(params.deleted, (p) => `deleted = ${p}`)
    .maybe(params.with_cdn, (p) => `with_cdn = ${p}`)
  if (params.cursor) {
    const [id] = decodeCursor(params.cursor, ['int8'])
    where.add((p) => `data_set_id < ${p}::bigint`, id)
  }
  const limit = where.param(params.limit + 1)
  const rows = await db.query(
    `select ${COLUMNS} from ${table(schemas)} ${where}
     order by data_set_id desc limit ${limit}`,
    where.params
  )
  return toPage(rows, params.limit, mapDataSet, (r) => [req(r.data_set_id)])
}

/** Get one data set by id. */
export async function getDataSet(
  db: Db,
  schemas: Schemas,
  dataSetId: string
): Promise<DataSet | undefined> {
  const rows = await db.query(
    `select ${COLUMNS} from ${table(schemas)} where data_set_id = $1::bigint`,
    [dataSetId]
  )
  return rows[0] && mapDataSet(rows[0])
}
