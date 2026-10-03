import { describe, expect, it, vi } from 'vitest'
import { staleWhileRevalidate } from '../src/swr-cache.ts'

/** Map-backed Cache with the subset of the API the helper uses. */
function fakeCache() {
  const entries = new Map<string, Response>()
  const cache = {
    match: (key: string) => Promise.resolve(entries.get(key)?.clone()),
    put: (key: string, res: Response) => {
      entries.set(key, res)
      return Promise.resolve()
    },
    delete: (key: string) => Promise.resolve(entries.delete(key)),
  }
  return { cache: cache as unknown as Cache, entries }
}

/** Run the helper with a controllable clock and awaited background work. */
function setup() {
  const { cache, entries } = fakeCache()
  let time = 1_000
  const background: Promise<unknown>[] = []
  const load = vi.fn(() => Promise.resolve<string | undefined>('a'))
  const revalidate = vi.fn(() => Promise.resolve<string | undefined>('b'))
  const get = (key = 'https://cache/k') =>
    staleWhileRevalidate({
      cache,
      key,
      freshMs: 100,
      maxAgeSeconds: 60,
      now: () => time,
      load,
      revalidate,
      waitUntil: (p) => background.push(p),
    })
  return {
    entries,
    load,
    revalidate,
    get,
    advance: (ms: number) => {
      time += ms
    },
    settle: () => Promise.all(background.splice(0)),
  }
}

describe('staleWhileRevalidate', () => {
  it('loads and stores on a miss, then serves the fresh entry', async () => {
    const t = setup()
    expect(await t.get()).toEqual({ value: 'a', status: 'miss' })
    await t.settle()
    const stored = t.entries.get('https://cache/k')
    expect(stored?.headers.get('cache-control')).toBe('public, max-age=60')

    t.advance(99)
    expect(await t.get()).toEqual({ value: 'a', status: 'hit' })
    expect(t.load).toHaveBeenCalledTimes(1)
    expect(t.revalidate).not.toHaveBeenCalled()
  })

  it('serves a stale entry and refreshes it in the background', async () => {
    const t = setup()
    await t.get()
    await t.settle()
    t.advance(100)
    // Stale reads while a refresh is in flight share it.
    const refreshed = Promise.withResolvers<string>()
    t.revalidate.mockReturnValueOnce(refreshed.promise)
    expect(await t.get()).toEqual({ value: 'a', status: 'stale' })
    expect(await t.get()).toEqual({ value: 'a', status: 'stale' })
    refreshed.resolve('b')
    await t.settle()
    expect(t.revalidate).toHaveBeenCalledTimes(1)
    expect(await t.get()).toEqual({ value: 'b', status: 'hit' })
  })

  it('deletes the entry when the refreshed value is gone', async () => {
    const t = setup()
    await t.get()
    await t.settle()
    t.revalidate.mockResolvedValueOnce(undefined)
    t.advance(100)
    await t.get()
    await t.settle()
    expect(t.entries.size).toBe(0)
  })

  it('keeps the stale entry when the refresh fails', async () => {
    const t = setup()
    await t.get()
    await t.settle()
    t.revalidate.mockRejectedValueOnce(new Error('db down'))
    t.advance(100)
    await t.get()
    await t.settle()
    expect(await t.get()).toEqual({ value: 'a', status: 'stale' })
    await t.settle()
    expect(await t.get()).toEqual({ value: 'b', status: 'hit' })
  })

  it('does not store missing values', async () => {
    const t = setup()
    t.load.mockResolvedValueOnce(undefined)
    expect(await t.get()).toEqual({ value: undefined, status: 'miss' })
    await t.settle()
    expect(t.entries.size).toBe(0)
  })
})
