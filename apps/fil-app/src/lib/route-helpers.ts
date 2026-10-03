import { notFound } from '@tanstack/react-router'
import { useMemo } from 'react'
import { ApiError } from '@/lib/api/client'
import { ID_RE } from '@/lib/search'

/**
 * Throw a router not-found for ids that are not unsigned integers.
 *
 * @param id - Path id.
 */
export function assertId(id: string) {
  if (!ID_RE.test(id)) {
    throw notFound()
  }
}

/**
 * Await a loader fetch, mapping fil-api 404s to router not-found.
 *
 * @param promise - Loader promise.
 */
export async function orNotFound<T>(promise: Promise<T>) {
  try {
    return await promise
  } catch (error) {
    if (ApiError.isNotFound(error)) {
      throw notFound()
    }
    throw error
  }
}

/**
 * Flatten infinite-query pages into one row array.
 *
 * @param data - Infinite query data.
 */
function flattenPages<T>(data: { pages: { data: T[] }[] } | undefined): T[] {
  return data?.pages.flatMap((page) => page.data) ?? []
}

/**
 * Memoized {@link flattenPages} for table data.
 *
 * @param data - Infinite query data.
 */
export function useFlatPages<T>(
  data: { pages: { data: T[] }[] } | undefined
): T[] {
  return useMemo(() => flattenPages(data), [data])
}
