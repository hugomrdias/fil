import { isAddress } from 'viem'

/** Result of classifying a free-text explorer search. */
export type SearchTarget =
  | { type: 'address'; address: `0x${string}` }
  | { type: 'piece'; cid: string }
  | { type: 'id'; id: string }
  | { type: 'invalid' }

/** Unsigned integer id that fits a uint64-sized fil-api id. */
export const ID_RE = /^\d{1,19}$/
// PieceCID v2 (bafkzcib…) and legacy v1 CommP (baga6ea4seaq…).
const PIECE_RE = /^(bafkzcib|baga6ea4seaq)[a-z2-7]+$/

/**
 * Classify an explorer search query.
 *
 * @param query - Raw user input.
 * @returns What the query refers to.
 */
export function classifySearch(query: string): SearchTarget {
  const value = query.trim()
  if (isAddress(value, { strict: false })) {
    return { type: 'address', address: value.toLowerCase() as `0x${string}` }
  }
  if (PIECE_RE.test(value)) {
    return { type: 'piece', cid: value }
  }
  if (ID_RE.test(value)) {
    return { type: 'id', id: BigInt(value).toString() }
  }
  return { type: 'invalid' }
}
