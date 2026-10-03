import { ApiError } from './errors.ts'

/** A keyset cursor: the sort key of the last row on the previous page. */
export type CursorKey = readonly (string | number)[]

/** One page of results. */
export interface Page<T> {
  data: T[]
  nextCursor: string | null
}

/** Encode a sort key as an opaque base64url cursor. */
export function encodeCursor(key: CursorKey): string {
  const bytes = new TextEncoder().encode(JSON.stringify(key))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

/**
 * Decode a cursor into a sort key with `size` string parts.
 *
 * @throws {ApiError} 400 `invalid_cursor` when the cursor is malformed.
 */
export function decodeCursor(cursor: string, size: number): string[] {
  try {
    const b64 = cursor.replaceAll('-', '+').replaceAll('_', '/')
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    )
    const key: unknown = JSON.parse(json)
    if (
      Array.isArray(key) &&
      key.length === size &&
      key.every((v) => typeof v === 'string' || typeof v === 'number')
    ) {
      return key.map(String)
    }
  } catch {
    // fall through
  }
  throw new ApiError(400, 'invalid_cursor', 'Invalid cursor')
}

/**
 * Build a page from rows fetched with `limit + 1`, using the extra row to
 * detect whether another page exists.
 */
export function toPage<R, T>(
  rows: R[],
  limit: number,
  map: (row: R) => T,
  key: (row: R) => CursorKey
): Page<T> {
  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const last = pageRows.at(-1)
  return {
    data: pageRows.map(map),
    nextCursor: hasMore && last !== undefined ? encodeCursor(key(last)) : null,
  }
}
