import { describe, expect, it } from 'vitest'
import { rows, testApp } from './helpers.ts'

const observer = rows.checkpoint
const repair = {
  ...rows.checkpoint,
  schema: 'early-repair',
  latest_checkpoint:
    '179098338000000000003141590000000004121950999999999999999999999999999999999',
}

describe('health', () => {
  it('reports the latest block per network and indexer', async () => {
    const { request, fake } = testApp(() => [observer, repair])
    const res = await request('/health')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({
      ok: true,
      networks: {
        calibration: {
          status: 'ok',
          chainId: 314159,
          blockNumber: 4121900,
          indexers: { 'foc-observer': 4121900, 'early-repair': 4121950 },
        },
        mainnet: {
          status: 'ok',
          chainId: 314,
          blockNumber: 4121900,
          indexers: { 'foc-observer': 4121900, 'early-repair': 4121950 },
        },
      },
    })
    expect(fake.closed).toBe(2)
  })

  it('marks unconfigured networks unavailable without failing', async () => {
    const { request } = testApp(() => [observer, repair], {
      HYPERDRIVE_MAINNET: undefined,
    })
    const res = await request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      ok: true,
      networks: { mainnet: { status: 'unavailable' } },
    })
  })

  it('returns 503 when a database fails', async () => {
    const { request, fake } = testApp(() => {
      throw new Error('connection refused')
    })
    const res = await request('/health')
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      ok: false,
      networks: {
        calibration: { status: 'error' },
        mainnet: { status: 'error' },
      },
    })
    expect(fake.closed).toBe(2)
  })
})
