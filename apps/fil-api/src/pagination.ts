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
  return Buffer.from(JSON.stringify(key)).toString('base64url')
}

/** Largest value of a Postgres `bigint` (`int8`). */
const INT8_MAX = 9223372036854775807n

/** Whether `value` is a decimal integer that fits in a Postgres `bigint`. */
export function isInt8(value: string): boolean {
  return /^\d{1,19}$/.test(value) && BigInt(value) <= INT8_MAX
}

/** Type of one cursor part, checked before it reaches a SQL cast. */
export type CursorPart = 'int8' | 'address'

const CURSOR_PART_CHECKS: Record<CursorPart, (value: string) => boolean> = {
  int8: isInt8,
  address: (value) => /^0x[0-9a-f]{40}$/.test(value),
}

/**
 * Decode a cursor into a sort key whose parts match `parts`.
 *
 * @throws {ApiError} 400 `invalid_cursor` when the cursor is malformed or a
 * part has the wrong type.
 */
export function decodeCursor(cursor: string, parts: CursorPart[]): string[] {
  try {
    const key: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString())
    if (Array.isArray(key) && key.length === parts.length) {
      const values = key.map(String)
      if (
        key.every((v) => typeof v === 'string' || typeof v === 'number') &&
        values.every((v, i) => CURSOR_PART_CHECKS[parts[i] ?? 'int8'](v))
      ) {
        return values
      }
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
