import type { Schemas } from './client'

/**
 * Lowest latest block across a network's indexers, so every fil-api table
 * includes it; undefined when an indexer has not checkpointed yet.
 *
 * @param status - fil-api `/{network}/status` data.
 */
export function indexedBlock(status: Schemas['Status']): bigint | undefined {
  let lowest: bigint | undefined
  for (const indexer of status.indexers) {
    if (!indexer.latest) {
      return undefined
    }
    const block = BigInt(indexer.latest.blockNumber)
    if (lowest === undefined || block < lowest) {
      lowest = block
    }
  }
  return lowest
}

/** Options for {@link waitForIndexer}. */
export interface WaitForIndexerOptions {
  /** Block the indexers must reach. */
  block: bigint
  /** Fetch fresh fil-api status data. */
  getStatus: () => Promise<Schemas['Status']>
  /** Poll interval in milliseconds. */
  interval?: number
  /** Give up after this many milliseconds. */
  timeout?: number
}

/**
 * Poll fil-api status until every indexer reaches a block, e.g. one holding
 * a write the app just confirmed. Status errors count as not caught up.
 *
 * @param options - {@link WaitForIndexerOptions}
 * @returns Whether the indexers caught up before the timeout.
 */
export async function waitForIndexer(
  options: WaitForIndexerOptions
): Promise<boolean> {
  const { block, getStatus, interval = 5000, timeout = 180_000 } = options
  const deadline = Date.now() + timeout
  while (true) {
    try {
      const indexed = indexedBlock(await getStatus())
      if (indexed !== undefined && indexed >= block) {
        return true
      }
    } catch {
      // Retry on the next poll.
    }
    if (Date.now() + interval > deadline) {
      return false
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}
