import { tryFrom as tryPieceCid } from '@filoz/synapse-core/piece'
import { isAddress } from 'viem'

/** Result of classifying a free-text explorer search. */
export type SearchTarget =
  | { type: 'address'; address: `0x${string}` }
  | { type: 'piece'; cid: string }
  | { type: 'legacy-piece' }
  | { type: 'id'; id: string }
  | { type: 'invalid' }

/**
 * Unsigned integer id that fits a uint64-sized fil-api id. It is spelled
 * `[0-9]` rather than `\d` because WebMCP tool schemas expose it as a JSON
 * Schema `pattern`, where `\d` is escaped and agents misread it.
 */
export const ID_RE = /^[0-9]{1,19}$/
// Base32 prefix of every legacy v1 PieceCID (fil-commitment-unsealed codec,
// sha2-256-trunc254-padded multihash). fil-api stores only v2.
const LEGACY_PIECE_RE = /^baga6ea4seaq[a-z2-7]+$/

/**
 * Classify an explorer search query. PieceCIDs are parsed with synapse-core,
 * which accepts only v2, and returned in canonical form.
 *
 * @param query - Raw user input.
 * @returns What the query refers to.
 * @see https://github.com/filecoin-project/FIPs/blob/master/FRCs/frc-0069.md
 */
export function classifySearch(query: string): SearchTarget {
  const value = query.trim()
  if (isAddress(value, { strict: false })) {
    return { type: 'address', address: value.toLowerCase() as `0x${string}` }
  }
  if (ID_RE.test(value)) {
    return { type: 'id', id: BigInt(value).toString() }
  }
  const piece = value ? tryPieceCid(value) : null
  if (piece) {
    return { type: 'piece', cid: piece.toString() }
  }
  if (LEGACY_PIECE_RE.test(value)) {
    return { type: 'legacy-piece' }
  }
  return { type: 'invalid' }
}
