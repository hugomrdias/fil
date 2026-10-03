import { log } from './log.ts'

/** How {@link staleWhileRevalidate} answered: fresh entry, stale entry or a load. */
export type CacheStatus = 'hit' | 'stale' | 'miss'

/** Options for {@link staleWhileRevalidate}. */
export interface SwrOptions<T> {
  /** Cache to store entries in, usually `caches.default`. */
  cache: Cache
  /** Cache key; an absolute URL. */
  key: string
  /** Age in milliseconds after which an entry is stale and refreshed. */
  freshMs: number
  /** Seconds the cache keeps an entry; stale entries are served until then. */
  maxAgeSeconds: number
  /** Clock in milliseconds; tests inject one. */
  now?: () => number
  /** Load the value on a miss; `undefined` means none and is not cached. */
  load: () => Promise<T | undefined>
  /** Load the value for a background refresh; defaults to `load`. */
  revalidate?: () => Promise<T | undefined>
  /** Keep the invocation alive for work after the response. */
  waitUntil: (promise: Promise<unknown>) => void
}

/** A value and when it was stored, as kept in the cache. */
interface Entry<T> {
  value: T
  storedAt: number
}

/** Background refreshes in flight in this isolate, by cache key. */
const refreshing = new Map<string, Promise<void>>()

/**
 * Read `key` from the cache with stale-while-revalidate semantics. A fresh
 * entry is returned as is. A stale entry is returned too, and refreshed in
 * the background after the response, at most once at a time per key in an
 * isolate. A miss loads the value and stores it after the response.
 *
 * @see https://developers.cloudflare.com/workers/runtime-apis/cache/
 * @see https://www.rfc-editor.org/rfc/rfc5861#section-3
 */
export async function staleWhileRevalidate<T>(
  options: SwrOptions<T>
): Promise<{ value: T | undefined; status: CacheStatus }> {
  const now = options.now ?? Date.now
  const cached = await options.cache.match(options.key)
  if (cached) {
    const entry = (await cached.json()) as Entry<T>
    if (now() - entry.storedAt < options.freshMs) {
      return { value: entry.value, status: 'hit' }
    }
    if (!refreshing.has(options.key)) {
      const task = refresh(options, now).finally(() =>
        refreshing.delete(options.key)
      )
      refreshing.set(options.key, task)
      options.waitUntil(task)
    }
    return { value: entry.value, status: 'stale' }
  }
  const value = await options.load()
  if (value !== undefined) options.waitUntil(store(options, value, now()))
  return { value, status: 'miss' }
}

/**
 * Reload a stale entry: store the new value, or delete the entry when the
 * value is gone. Failures keep the stale entry.
 */
async function refresh<T>(options: SwrOptions<T>, now: () => number) {
  try {
    const value = await (options.revalidate ?? options.load)()
    if (value === undefined) await options.cache.delete(options.key)
    else await store(options, value, now())
  } catch (error) {
    log('warn', {
      message: 'cache revalidation failed',
      key: options.key,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/** Store `value` under the options' key for `maxAgeSeconds`. */
function store<T>(options: SwrOptions<T>, value: T, storedAt: number) {
  const entry: Entry<T> = { value, storedAt }
  return options.cache.put(
    options.key,
    new Response(JSON.stringify(entry), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${options.maxAgeSeconds}`,
      },
    })
  )
}
