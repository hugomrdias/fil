import { invalidInput } from '../errors.ts'

/**
 * Encode a keyset position (sort value and ID of the last row) as an opaque
 * `nextCursor` string.
 */
export function encodeCursor(sortValue: string, id: string): string {
  return Buffer.from(JSON.stringify([sortValue, id])).toString('base64url')
}

/** Decode a cursor from {@link encodeCursor}; rejects anything else. */
export function decodeCursor(cursor: string): [string, string] {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    )
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      value.every((part) => typeof part === 'string')
    ) {
      return value as [string, string]
    }
  } catch {
    // Reported below.
  }
  throw invalidInput(
    'Invalid cursor; pass the nextCursor of a previous page.',
    'cursor'
  )
}

/** One page of rows and the cursor of the next page, if any. */
export type Page<T> = { items: T[]; nextCursor?: string }
