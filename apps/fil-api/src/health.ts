import { type DbFactory, type DbStats, openNetworkDb } from './db.ts'
import { log } from './log.ts'
import { type Bindings, NETWORK_NAMES, type NetworkName } from './networks.ts'
import { getStatus } from './queries/status.ts'

/** Health of one network's indexer database. */
export type NetworkHealth =
  | {
      status: 'ok'
      chainId: number
      /** Lowest latest block across indexers: data is complete up to here. */
      blockNumber: number | null
      /** Latest indexed block per indexer schema. */
      indexers: Record<string, number | null>
    }
  | { status: 'unavailable' }
  | { status: 'error' }

/** Response body of `GET /health`. */
export interface Health {
  ok: boolean
  networks: Record<NetworkName, NetworkHealth>
}

/** Dependencies for {@link checkHealth}. */
export interface HealthContext {
  env: Bindings
  dbFactory: DbFactory
  dbStats: DbStats
  waitUntil: (promise: Promise<unknown>) => void
  requestId?: string
  /** Per-network query timeout in milliseconds. */
  timeoutMs?: number
}

/** Resolve `promise`, or reject if it takes longer than `ms`. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${ms}ms`)),
          ms
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Check one network: unconfigured networks are `unavailable`, not errors. */
async function checkNetwork(
  ctx: HealthContext,
  name: NetworkName
): Promise<NetworkHealth> {
  const opened = openNetworkDb(ctx.env, name, ctx.dbFactory, ctx.dbStats)
  if (!opened) return { status: 'unavailable' }
  try {
    const status = await withTimeout(
      getStatus(opened.db, opened.network),
      ctx.timeoutMs ?? 5000
    )
    const indexers = Object.fromEntries(
      status.indexers.map((i) => [i.schema, i.latest?.blockNumber ?? null])
    )
    const blocks = Object.values(indexers)
    return {
      status: 'ok',
      chainId: status.chainId,
      blockNumber: blocks.includes(null)
        ? null
        : Math.min(...(blocks as number[])),
      indexers,
    }
  } catch (error) {
    log('error', {
      message: 'health check failed',
      requestId: ctx.requestId,
      network: name,
      error: error instanceof Error ? error.message : String(error),
    })
    return { status: 'error' }
  } finally {
    ctx.waitUntil(opened.close())
  }
}

/**
 * Check every network's indexer database and report its latest indexed
 * block. `ok` is false when any configured network fails.
 */
export async function checkHealth(ctx: HealthContext): Promise<Health> {
  const results = await Promise.all(
    NETWORK_NAMES.map(async (name) => [name, await checkNetwork(ctx, name)])
  )
  const networks = Object.fromEntries(results) as Health['networks']
  const ok = Object.values(networks).every((n) => n.status !== 'error')
  return { ok, networks }
}
