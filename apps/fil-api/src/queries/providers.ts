import type { Db } from '../db.ts'
import { notFound } from '../errors.ts'
import type { Schemas } from '../networks.ts'
import { decodeCursor, type Page, toPage } from '../pagination.ts'
import type { Provider } from '../schemas/resources.ts'
import { ident, raw, sql, where } from '../sql.ts'
import { reqAddr } from './map.ts'

/** Filters for {@link listProviders}. */
export interface ListProvidersParams {
  approved?: boolean
  active?: boolean
  endorsed?: boolean
  limit: number
  cursor?: string
}

/** A `providers` row. */
interface ProviderRow {
  provider_id: string
  provider_address: string | null
  name: string | null
  service_url: string | null
  provider_active: boolean
  pdp_product_active: boolean
  approved: boolean
  endorsed: boolean
  created_at_block: string | null
  updated_at_block: string
}

const COLUMNS = raw(`provider_id, provider_address, name, service_url,
  provider_active, pdp_product_active, approved, endorsed,
  created_at_block, updated_at_block`)

/** Schema-qualified `providers` view. */
function table(schemas: Schemas) {
  return sql`${ident(schemas.repair)}.providers`
}

/** Map a `providers` row to the API shape. */
function mapProvider(row: ProviderRow): Provider {
  return {
    providerId: row.provider_id,
    address: reqAddr(row.provider_address),
    name: row.name,
    serviceUrl: row.service_url,
    active: row.provider_active,
    pdpProductActive: row.pdp_product_active,
    approved: row.approved,
    endorsed: row.endorsed,
    createdAtBlock: row.created_at_block,
    updatedAtBlock: row.updated_at_block,
  }
}

/** List storage providers, newest id first. */
export async function listProviders(
  db: Db,
  schemas: Schemas,
  params: ListProvidersParams
): Promise<Page<Provider>> {
  const [id] = params.cursor ? decodeCursor(params.cursor, ['int8']) : []
  const rows = await db.query<ProviderRow>(
    sql`select ${COLUMNS} from ${table(schemas)} ${where([
      params.approved !== undefined && sql`approved = ${params.approved}`,
      params.active !== undefined && sql`provider_active = ${params.active}`,
      params.endorsed !== undefined && sql`endorsed = ${params.endorsed}`,
      id !== undefined && sql`provider_id < ${id}::bigint`,
    ])}
     order by provider_id desc limit ${params.limit + 1}`
  )
  return toPage(rows, params.limit, mapProvider, (r) => [r.provider_id])
}

/** Get one storage provider by id; throws 404 when it does not exist. */
export async function getProvider(
  db: Db,
  schemas: Schemas,
  providerId: string
): Promise<Provider> {
  const rows = await db.query<ProviderRow>(
    sql`select ${COLUMNS} from ${table(schemas)}
     where provider_id = ${providerId}::bigint`
  )
  if (!rows[0]) throw notFound('Provider', providerId)
  return mapProvider(rows[0])
}
