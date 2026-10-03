import { type Db, ident, logIndex, type Row, Where } from '../db.ts'
import type { Schemas } from '../networks.ts'
import { decodeCursor, type Page, toPage } from '../pagination.ts'
import type { Rail, Settlement } from '../schemas/resources.ts'
import { num, req, str } from './map.ts'

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

/**
 * Current rail state folded from Filecoin Pay events: the creation event plus
 * the latest rate and lockup changes, termination and finalization. `where`
 * and `limit` apply here, before settlement totals are joined, so totals are
 * only aggregated for rails on the returned page.
 *
 * @see https://github.com/FilOzone/filecoin-pay
 */
function railQuery(s: string, where: string, limit: string) {
  return `select page.*, st.settled_up_to, st.total_settled_amount,
    st.total_net_payee_amount
  from (
    select c.rail_id, c.payer, c.payee, c.token, c.operator, c.validator,
      c.service_fee_recipient, c.commission_rate_bps, c.block_number,
      c.timestamp, c.tx_hash,
      r.new_rate, l.new_lockup_period, l.new_lockup_fixed,
      t.end_epoch, t.by as terminated_by, f.finalized
    from ${s}.fp_rail_created c
    left join lateral (
      select x.new_rate from ${s}.fp_rail_rate_modified x
      where x.rail_id = c.rail_id
      order by x.block_number desc, ${logIndex('x')} desc limit 1
    ) r on true
    left join lateral (
      select x.new_lockup_period, x.new_lockup_fixed
      from ${s}.fp_rail_lockup_modified x
      where x.rail_id = c.rail_id
      order by x.block_number desc, ${logIndex('x')} desc limit 1
    ) l on true
    left join lateral (
      select x.end_epoch, x.by from ${s}.fp_rail_terminated x
      where x.rail_id = c.rail_id
      order by x.block_number desc, ${logIndex('x')} desc limit 1
    ) t on true
    left join lateral (
      select true as finalized from ${s}.fp_rail_finalized x
      where x.rail_id = c.rail_id limit 1
    ) f on true
    ${where}
    order by c.rail_id desc limit ${limit}
  ) page
  left join lateral (
    select max(x.settled_up_to) as settled_up_to,
      coalesce(sum(x.total_settled_amount), 0) as total_settled_amount,
      coalesce(sum(x.total_net_payee_amount), 0) as total_net_payee_amount
    from ${s}.fp_rail_settled x where x.rail_id = page.rail_id
  ) st on true
  order by page.rail_id desc`
}

const STATE_CONDITIONS: Record<RailState, string> = {
  active: 't.end_epoch is null and f.finalized is null',
  terminated: 't.end_epoch is not null and f.finalized is null',
  finalized: 'f.finalized is not null',
}

/** Derive the lifecycle state from the folded rail row. */
export function railState(row: Row): RailState {
  if (row.finalized) return 'finalized'
  if (row.end_epoch !== null && row.end_epoch !== undefined) return 'terminated'
  return 'active'
}

/** Map a folded rail row to the API shape. */
export function mapRail(row: Row): Rail {
  return {
    railId: req(row.rail_id),
    state: railState(row),
    payer: req(row.payer),
    payee: req(row.payee),
    token: req(row.token),
    operator: req(row.operator),
    validator: req(row.validator),
    serviceFeeRecipient: req(row.service_fee_recipient),
    commissionRateBps: req(row.commission_rate_bps),
    paymentRate: str(row.new_rate) ?? '0',
    lockupPeriod: str(row.new_lockup_period) ?? '0',
    lockupFixed: str(row.new_lockup_fixed) ?? '0',
    endEpoch: str(row.end_epoch),
    terminatedBy: str(row.terminated_by),
    settledUpTo: str(row.settled_up_to),
    totalSettledAmount: str(row.total_settled_amount) ?? '0',
    totalNetPayeeAmount: str(row.total_net_payee_amount) ?? '0',
    createdAtBlock: req(row.block_number),
    createdAt: num(row.timestamp),
    txHash: req(row.tx_hash),
  }
}

/** List payment rails with their current state, newest rail first. */
export async function listRails(
  db: Db,
  schemas: Schemas,
  params: ListRailsParams
): Promise<Page<Rail>> {
  const where = new Where()
    .maybe(params.payer?.toLowerCase(), (p) => `c.payer = ${p}`)
    .maybe(params.payee?.toLowerCase(), (p) => `c.payee = ${p}`)
    .maybe(params.operator?.toLowerCase(), (p) => `c.operator = ${p}`)
    .maybe(params.token?.toLowerCase(), (p) => `c.token = ${p}`)
  if (params.state) where.raw(STATE_CONDITIONS[params.state])
  if (params.cursor) {
    const [id] = decodeCursor(params.cursor, ['int8'])
    where.add((p) => `c.rail_id < ${p}::numeric`, id)
  }
  const limit = where.param(params.limit + 1)
  const rows = await db.query(
    railQuery(ident(schemas.observer), where.toString(), limit),
    where.params
  )
  return toPage(rows, params.limit, mapRail, (r) => [req(r.rail_id)])
}

/** Get one payment rail with its current state. */
export async function getRail(
  db: Db,
  schemas: Schemas,
  railId: string
): Promise<Rail | undefined> {
  const rows = await db.query(
    railQuery(ident(schemas.observer), 'where c.rail_id = $1::numeric', '1'),
    [railId]
  )
  return rows[0] && mapRail(rows[0])
}

/** Map an `fp_rail_settled` row to the API shape. */
export function mapSettlement(row: Row): Settlement {
  return {
    railId: req(row.rail_id),
    totalSettledAmount: req(row.total_settled_amount),
    totalNetPayeeAmount: req(row.total_net_payee_amount),
    operatorCommission: req(row.operator_commission),
    networkFee: req(row.network_fee),
    settledUpTo: req(row.settled_up_to),
    blockNumber: req(row.block_number),
    timestamp: num(row.timestamp),
    txHash: req(row.tx_hash),
  }
}

/** List settlements of one rail, newest first. */
export async function listRailSettlements(
  db: Db,
  schemas: Schemas,
  params: ListSettlementsParams
): Promise<Page<Settlement>> {
  const where = new Where().add((p) => `rail_id = ${p}::numeric`, params.railId)
  if (params.cursor) {
    const [block, index] = decodeCursor(params.cursor, ['int8', 'int8'])
    where.add(
      (a, b) => `(block_number, ${logIndex()}) < (${a}::numeric, ${b}::int)`,
      block,
      index
    )
  }
  const limit = where.param(params.limit + 1)
  const rows = await db.query(
    `select ${logIndex()} as log_index, rail_id, total_settled_amount,
       total_net_payee_amount, operator_commission, network_fee,
       settled_up_to, block_number, timestamp, tx_hash
     from ${ident(schemas.observer)}.fp_rail_settled ${where}
     order by block_number desc, log_index desc limit ${limit}`,
    where.params
  )
  return toPage(rows, params.limit, mapSettlement, (r) => [
    req(r.block_number),
    req(r.log_index),
  ])
}
