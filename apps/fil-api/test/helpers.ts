import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { createApp } from '../src/app.ts'
import type { Db, Row } from '../src/db.ts'
import type { Bindings } from '../src/networks.ts'

/** A query recorded by {@link fakeDb}. */
export interface RecordedQuery {
  text: string
  params: readonly unknown[]
}

/** Fake database that records queries and answers from a handler. */
export function fakeDb(
  handler: (text: string, params: readonly unknown[]) => Row[] = () => []
) {
  const queries: RecordedQuery[] = []
  let closed = 0
  const db: Db = {
    query<T extends Row = Row>(text: string, params: readonly unknown[] = []) {
      queries.push({ text, params })
      return Promise.resolve(handler(text, params) as T[])
    },
    close() {
      closed++
      return Promise.resolve()
    },
  }
  return {
    db,
    queries,
    get closed() {
      return closed
    },
  }
}

/** Create an app wired to a fake database and send it a request. */
export function testApp(
  handler?: (text: string, params: readonly unknown[]) => Row[],
  bindings: Partial<Bindings> = {}
) {
  const fake = fakeDb(handler)
  const app = createApp({ dbFactory: () => fake.db })
  const testEnv = { ...env, ...bindings } as Bindings
  async function request(path: string, init?: RequestInit) {
    const ctx = createExecutionContext()
    const res = await app.request(path, init, testEnv, ctx)
    await waitOnExecutionContext(ctx)
    return res
  }
  return { app, fake, request }
}

/** Rate limiter that always allows or always rejects. */
export function fakeLimiter(success: boolean): RateLimit {
  return { limit: () => Promise.resolve({ success }) }
}

/** Fixture rows in database shape. */
export const rows = {
  provider: {
    provider_id: '2',
    provider_address: '0xbcdf1bdc1a97d071a5a8ef03f1f05225b6e2a1ba',
    name: 'ezpdpz-calib2',
    service_url: 'https://calib2.ezpdpz.net',
    provider_active: true,
    pdp_product_active: true,
    approved: true,
    endorsed: false,
    created_at_block: '3148298',
    updated_at_block: '3150811',
  },
  dataSet: {
    data_set_id: '14015',
    provider_id: '2',
    payer: '0x480c51fe9fc90e01fa742c51300cc29e151a71cd',
    source: 'filecoin-pin',
    metadata: { source: 'filecoin-pin', withIPFSIndexing: '' },
    with_cdn: false,
    with_ipfs_indexing: true,
    pdp_end_epoch: null,
    deleted: false,
    created_at_block: '3144601',
    updated_at_block: '3144601',
  },
  piece: {
    data_set_id: '1',
    piece_id: '0',
    cid: 'bafkzcibfq263oaytvzyzerkprzkwx5l3ek3dwyngge4sim2o3ahsk7shfendo7jvdm7a',
    raw_size: '9445754',
    metadata: null,
    removed: false,
    added_at_block: '3144604',
    removed_at_block: null,
    updated_at_block: '3144604',
  },
  rail: {
    rail_id: '12818',
    payer: '0x290c51f674ecf478e7ec20810b600bb6526622b4',
    payee: '0xbcdf1bdc1a97d071a5a8ef03f1f05225b6e2a1ba',
    token: '0xb3042734b608a1b16e9e86b374a3f3e389b4cdf0',
    operator: '0x02925630df557f957f70e112ba06e50965417ca0',
    validator: '0x02925630df557f957f70e112ba06e50965417ca0',
    service_fee_recipient: '0x02925630df557f957f70e112ba06e50965417ca0',
    commission_rate_bps: '0',
    block_number: '3435668',
    timestamp: '1770396420',
    tx_hash: '0x17a2',
    new_rate: '694444444444',
    new_lockup_period: '86400',
    new_lockup_fixed: '0',
    end_epoch: null,
    terminated_by: null,
    finalized: null,
    settled_up_to: '4121831',
    total_settled_amount: '466167361110812764',
    total_net_payee_amount: '463836524305258685',
  },
  settlement: {
    id: '0xd7af-3',
    rail_id: '12818',
    total_settled_amount: '5999999999996160',
    total_net_payee_amount: '5969999999996179',
    operator_commission: '0',
    network_fee: '29999999999981',
    settled_up_to: '4121831',
    block_number: '4121949',
    timestamp: '1790984850',
    tx_hash: '0xd7af',
  },
  sessionKey: {
    identity: '0x44f08d1befe61255b3c3a349c392c560fa333759',
    signer: '0x0175111bf2475e2331610bfbad4b8fb9932d436e',
    expiry: '1789746124',
    updated_at_block: '4060502',
    permissions: [
      {
        permission:
          '0x954bdc254591a7eab1b73f03842464d9283a08352772737094d710a4428fd183',
        expiry: '1789746124',
        origin: 'synapse',
        blockNumber: '4060502',
        txHash: '0xabc',
      },
      {
        permission:
          '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f',
        expiry: '0',
        origin: '',
        blockNumber: '4060500',
        txHash: '0xdef',
      },
    ],
  },
  sessionKeyEvent: {
    id: '0x8fef-0',
    identity: '0x44f08d1befe61255b3c3a349c392c560fa333759',
    signer: '0x44f08d1befe61255b3c3a349c392c560fa333759',
    expiry: '1762964502',
    permissions:
      '["0x25ebf20299107c91b4624d5bac3a16d32cabf0db23b450ee09ab7732983b1dc9"]',
    origin: '',
    block_number: '3187939',
    timestamp: '1762964550',
    tx_hash: '0x04cc',
  },
  checkpoint: {
    schema: 'foc-observer',
    chain_name: 'calibnet',
    chain_id: '314159',
    latest_checkpoint:
      '179098338000000000003141590000000004121900999999999999999999999999999999999',
    safe_checkpoint:
      '179093562000000000003141590000000004120308999999999999999999999999999999999',
    finalized_checkpoint: null,
  },
} satisfies Record<string, Row>
