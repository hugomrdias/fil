import { type Db, logIndex } from '../db.ts'
import { notFound } from '../errors.ts'
import type { Schemas } from '../networks.ts'
import { decodeCursor, type Page, toPage } from '../pagination.ts'
import type { Rail, Settlement } from '../schemas/resources.ts'
import { ident, raw, type Sql, sql, where } from '../sql.ts'
import { addr, reqAddr } from './map.ts'

/** Rail lifecycle state filter. */
export type RailState = Rail['state']

/** Filters for {@link listRails}. */
export interface ListRailsParams {
  payer?: string
  payee?: string
  operator?: string
  token?: string
  state?: RailState
  limit: number
  cursor?: string
}

/** Pagination for {@link listRailSettlements}. */
export interface ListSettlementsParams {
  railId: string
  limit: number
  cursor?: string
}

/** A rail folded from Filecoin Pay events by {@link railQuery}. */
interface RailRow {
  rail_id: string
  payer: string
  payee: string
  token: string
  operator: string
  validator: string
  service_fee_recipient: string
  commission_rate_bps: string
  block_number: string
  timestamp: string
  tx_hash: string
  end_epoch: string | null
  terminated_by: string | null
  finalized: boolean | null
  new_rate: string | null
  new_lockup_period: string | null
  new_lockup_fixed: string | null
  settled_up_to: string | null
  total_settled_amount: string
  total_net_payee_amount: string
}

/** An `fp_rail_settled` row with its log index. */
interface SettlementRow {
  log_index: number
  rail_id: string
  total_settled_amount: string
  total_net_payee_amount: string
  operator_commission: string
  network_fee: string
  settled_up_to: string
  block_number: string
  timestamp: string
  tx_hash: string
}

/**
 * `order by` for the latest event of one rail. `+ 0` keeps the planner off
 * the `block_number` index: walking it backwards and filtering by `rail_id`
 * looks cheap but scans hundreds of thousands of other rails' events per rail
 * (rate changes are dominated by a few busy rails). The `rail_id` index plus a
 * top-1 sort is fast for all but those busy rails.
 */
function latestFirst(alias: string): Sql {
  return sql`${raw(alias)}.block_number + 0 desc, ${logIndex(alias)} desc`
}

/**
 * Current rail state folded from Filecoin Pay events: the creation event plus
 * termination, finalization, the latest rate and lockup changes and the
 * settlement totals. Only termination and finalization (which the `state`
 * filter needs) are joined before `filter` and `limit`; the other lookups run
 * for rails on the returned page only.
 *
 * @see https://github.com/FilOzone/filecoin-pay
 */
function railQuery(schemas: Schemas, filter: Sql, limit: Sql): Sql {
  const s = ident(schemas.observer)
  return sql`select page.*, r.new_rate, l.new_lockup_period, l.new_lockup_fixed,
    st.settled_up_to, st.total_settled_amount, st.total_net_payee_amount
  from (
    select c.rail_id, c.payer, c.payee, c.token, c.operator, c.validator,
      c.service_fee_recipient, c.commission_rate_bps, c.block_number,
      c.timestamp, c.tx_hash, t.end_epoch, t.by as terminated_by, f.finalized
    from ${s}.fp_rail_created c
    left join lateral (
      select x.end_epoch, x.by from ${s}.fp_rail_terminated x
      where x.rail_id = c.rail_id
      order by ${latestFirst('x')} limit 1
    ) t on true
    left join lateral (
      select true as finalized from ${s}.fp_rail_finalized x
      where x.rail_id = c.rail_id limit 1
    ) f on true
    ${filter}
    order by c.rail_id desc limit ${limit}
  ) page
  left join lateral (
    select x.new_rate from ${s}.fp_rail_rate_modified x
    where x.rail_id = page.rail_id
    order by ${latestFirst('x')} limit 1
  ) r on true
  left join lateral (
    select x.new_lockup_period, x.new_lockup_fixed
    from ${s}.fp_rail_lockup_modified x
    where x.rail_id = page.rail_id
    order by ${latestFirst('x')} limit 1
  ) l on true
  left join lateral (
    select max(x.settled_up_to) as settled_up_to,
      coalesce(sum(x.total_settled_amount), 0) as total_settled_amount,
      coalesce(sum(x.total_net_payee_amount), 0) as total_net_payee_amount
    from ${s}.fp_rail_settled x where x.rail_id = page.rail_id
  ) st on true
  order by page.rail_id desc`
}

const STATE_CONDITIONS: Record<RailState, Sql> = {
  active: raw('t.end_epoch is null and f.finalized is null'),
  terminated: raw('t.end_epoch is not null and f.finalized is null'),
  finalized: raw('f.finalized is not null'),
}

/** Derive the lifecycle state from the folded rail row. */
export function railState(
  row: Pick<RailRow, 'end_epoch' | 'finalized'>
): RailState {
  if (row.finalized) return 'finalized'
  if (row.end_epoch !== null) return 'terminated'
  return 'active'
}

/** Map a folded rail row to the API shape. */
function mapRail(row: RailRow): Rail {
  return {
    railId: row.rail_id,
    state: railState(row),
    payer: reqAddr(row.payer),
    payee: reqAddr(row.payee),
    token: reqAddr(row.token),
    operator: reqAddr(row.operator),
    validator: reqAddr(row.validator),
    serviceFeeRecipient: reqAddr(row.service_fee_recipient),
    commissionRateBps: row.commission_rate_bps,
    paymentRate: row.new_rate ?? '0',
    lockupPeriod: row.new_lockup_period ?? '0',
    lockupFixed: row.new_lockup_fixed ?? '0',
    endEpoch: row.end_epoch,
    terminatedBy: addr(row.terminated_by),
    settledUpTo: row.settled_up_to,
    totalSettledAmount: row.total_settled_amount,
    totalNetPayeeAmount: row.total_net_payee_amount,
    createdAtBlock: row.block_number,
    createdAt: Number(row.timestamp),
    txHash: row.tx_hash,
  }
}

/** List payment rails with their current state, newest rail first. */
export async function listRails(
  db: Db,
  schemas: Schemas,
  params: ListRailsParams
): Promise<Page<Rail>> {
  const [id] = params.cursor ? decodeCursor(params.cursor, ['int8']) : []
  const filter = where([
    params.payer !== undefined && sql`c.payer = ${params.payer}`,
    params.payee !== undefined && sql`c.payee = ${params.payee}`,
    params.operator !== undefined && sql`c.operator = ${params.operator}`,
    params.token !== undefined && sql`c.token = ${params.token}`,
    params.state !== undefined && STATE_CONDITIONS[params.state],
    id !== undefined && sql`c.rail_id < ${id}::numeric`,
  ])
  const rows = await db.query<RailRow>(
    railQuery(schemas, filter, sql`${params.limit + 1}`)
  )
  return toPage(rows, params.limit, mapRail, (r) => [r.rail_id])
}

/** Get one payment rail with its current state; throws 404 when missing. */
export async function getRail(
  db: Db,
  schemas: Schemas,
  railId: string
): Promise<Rail> {
  const rows = await db.query<RailRow>(
    railQuery(schemas, sql`where c.rail_id = ${railId}::numeric`, raw('1'))
  )
  if (!rows[0]) throw notFound('Rail', railId)
  return mapRail(rows[0])
}

/** Map an `fp_rail_settled` row to the API shape. */
function mapSettlement(row: SettlementRow): Settlement {
  return {
    railId: row.rail_id,
    totalSettledAmount: row.total_settled_amount,
    totalNetPayeeAmount: row.total_net_payee_amount,
    operatorCommission: row.operator_commission,
    networkFee: row.network_fee,
    settledUpTo: row.settled_up_to,
    blockNumber: row.block_number,
    timestamp: Number(row.timestamp),
    txHash: row.tx_hash,
  }
}

/** List settlements of one rail, newest first. */
export async function listRailSettlements(
  db: Db,
  schemas: Schemas,
  params: ListSettlementsParams
): Promise<Page<Settlement>> {
  const [block, index] = params.cursor
    ? decodeCursor(params.cursor, ['int8', 'int8'])
    : []
  const rows = await db.query<SettlementRow>(
    sql`select ${logIndex()} as log_index, rail_id, total_settled_amount,
       total_net_payee_amount, operator_commission, network_fee,
       settled_up_to, block_number, timestamp, tx_hash
     from ${ident(schemas.observer)}.fp_rail_settled ${where([
       sql`rail_id = ${params.railId}::numeric`,
       block !== undefined &&
         sql`(block_number, ${logIndex()}) < (${block}::numeric, ${index}::int)`,
     ])}
     order by block_number desc, log_index desc limit ${params.limit + 1}`
  )
  return toPage(rows, params.limit, mapSettlement, (r) => [
    r.block_number,
    String(r.log_index),
  ])
}
