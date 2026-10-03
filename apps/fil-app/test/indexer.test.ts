import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Schemas } from '../src/lib/api/client.ts'
import { indexedBlock, waitForIndexer } from '../src/lib/api/indexer.ts'

/**
 * Status data with one indexer per latest block (null = no checkpoint).
 *
 * @param blocks - Latest block of each indexer.
 */
function status(...blocks: (number | null)[]): Schemas['Status'] {
  const checkpoint = (blockNumber: number | null) =>
    blockNumber === null ? null : { blockNumber, timestamp: 0 }
  return {
    network: 'calibration',
    chainId: 314159,
    indexers: blocks.map((block, index) => ({
      schema: `schema-${index}`,
      chainName: 'calibnet',
      chainId: 314159,
      latest: checkpoint(block),
      safe: checkpoint(block),
      finalized: checkpoint(block),
    })),
  }
}

describe('indexedBlock', () => {
  it('returns the lowest latest block', () => {
    assert.equal(indexedBlock(status(120, 100, 110)), 100n)
  })

  it('is undefined while an indexer has no checkpoint', () => {
    assert.equal(indexedBlock(status(120, null)), undefined)
    assert.equal(indexedBlock(status()), undefined)
  })
})

describe('waitForIndexer', () => {
  it('polls until every indexer reaches the block', async () => {
    const responses = [status(90, 100), status(100, 99), status(101, 100)]
    let calls = 0
    const caughtUp = await waitForIndexer({
      block: 100n,
      getStatus: async () => responses[calls++],
      interval: 1,
    })
    assert.equal(caughtUp, true)
    assert.equal(calls, 3)
  })

  it('retries after status errors', async () => {
    let calls = 0
    const caughtUp = await waitForIndexer({
      block: 5n,
      getStatus: () => {
        calls++
        return calls === 1
          ? Promise.reject(new Error('unavailable'))
          : Promise.resolve(status(5))
      },
      interval: 1,
    })
    assert.equal(caughtUp, true)
    assert.equal(calls, 2)
  })

  it('gives up after the timeout', async () => {
    const caughtUp = await waitForIndexer({
      block: 100n,
      getStatus: async () => status(1),
      interval: 5,
      timeout: 20,
    })
    assert.equal(caughtUp, false)
  })
})
