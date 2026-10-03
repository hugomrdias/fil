import { type Db, ident, type Row, Where } from '../db.ts'
import type { Schemas } from '../networks.ts'
import { decodeCursor, type Page, toPage } from '../pagination.ts'
import type { Provider } from '../schemas/resources.ts'
import { bool, req, str } from './map.ts'

/** Filters for {@link listProviders}. */
export interface ListProvidersParams {
  approved?: boolean
  active?: boolean
  endorsed?: boolean
  limit: number
  cursor?: string
}

const COLUMNS = `provider_id, provider_address, name, service_url,
  provider_active, pdp_product_active, approved, endorsed,
  created_at_block, updated_at_block`

function table(schemas: Schemas) {
  return `${ident(schemas.repair)}.providers`
}

/** Map a `providers` row to the API shape. */
export function mapProvider(row: Row): Provider {
  return {
    providerId: req(row.provider_id),
    // Some registry rows store checksummed addresses; normalize like the rest.
    address: req(row.provider_address).toLowerCase(),
    name: str(row.name),
    serviceUrl: str(row.service_url),
    active: bool(row.provider_active),
    pdpProductActive: bool(row.pdp_product_active),
    approved: bool(row.approved),
    endorsed: bool(row.endorsed),
    createdAtBlock: str(row.created_at_block),
    updatedAtBlock: str(row.updated_at_block),
  }
}

/** List storage providers, newest id first. */
export async function listProviders(
  db: Db,
  schemas: Schemas,
  params: ListProvidersParams
): Promise<Page<Provider>> {
  const where = new Where()
    .maybe(params.approved, (p) => `approved = ${p}`)
    .maybe(params.active, (p) => `provider_active = ${p}`)
    .maybe(params.endorsed, (p) => `endorsed = ${p}`)
  if (params.cursor) {
    const [id] = decodeCursor(params.cursor, 1)
    where.add((p) => `provider_id < ${p}::bigint`, id)
  }
  const limit = where.param(params.limit + 1)
  const rows = await db.query(
    `select ${COLUMNS} from ${table(schemas)} ${where}
     order by provider_id desc limit ${limit}`,
    where.params
  )
  return toPage(rows, params.limit, mapProvider, (r) => [req(r.provider_id)])
}

/** Get one storage provider by id. */
export async function getProvider(
  db: Db,
  schemas: Schemas,
  providerId: string
): Promise<Provider | undefined> {
  const rows = await db.query(
    `select ${COLUMNS} from ${table(schemas)} where provider_id = $1::bigint`,
    [providerId]
  )
  return rows[0] && mapProvider(rows[0])
}
