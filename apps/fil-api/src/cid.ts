import {
  MULTIHASH_CODE as PIECE_MULTIHASH_CODE,
  tryFrom as tryPieceCid,
} from '@filoz/synapse-core/piece'
import { CID } from 'multiformats/cid'

/** `fil-commitment-unsealed` codec of legacy v1 PieceCIDs (`baga…`). */
const LEGACY_PIECE_CODEC = 0xf101

/** `dag-pb` codec, the only codec CIDv0 can express. */
const DAG_PB_CODEC = 0x70

/** `sha2-256` multihash, the only hash CIDv0 can express. */
const SHA2_256_CODE = 0x12

/**
 * A CID accepted by the retrieval route: a PieceCID v2 or the root CID of
 * IPFS content, normalized to its canonical base32 CIDv1 string.
 */
export interface RetrievalCid {
  kind: 'piece' | 'ipfs'
  cid: string
}

/**
 * Classify a CID string by its codec and multihash. PieceCIDs (raw codec with
 * the fr32-sha2-256-trunc254-padded-binary-tree multihash) are validated with
 * synapse-core; any other CID is treated as IPFS content. Throws a
 * `RangeError` for strings that are not CIDs and for legacy v1 PieceCIDs,
 * which the indexer does not store.
 *
 * @see https://github.com/filecoin-project/FIPs/blob/master/FRCs/frc-0069.md
 * @see https://github.com/multiformats/multicodec/blob/master/table.csv
 */
export function parseRetrievalCid(value: string): RetrievalCid {
  let cid: CID
  try {
    cid = CID.parse(value)
  } catch {
    throw new RangeError('Expected a CID')
  }
  if (cid.code === LEGACY_PIECE_CODEC) {
    throw new RangeError('Legacy v1 PieceCIDs are not supported, use v2')
  }
  if (cid.multihash.code === PIECE_MULTIHASH_CODE) {
    const piece = tryPieceCid(cid)
    if (!piece) throw new RangeError('Invalid PieceCID')
    return { kind: 'piece', cid: piece.toString() }
  }
  return { kind: 'ipfs', cid: cid.toV1().toString() }
}

/**
 * Parse a PieceCID v2 given as a multibase string or `0x` hex bytes and
 * return its canonical base32 string, the form the indexer stores. Throws a
 * `RangeError` for legacy v1 PieceCIDs and for anything else.
 *
 * @see https://github.com/filecoin-project/FIPs/blob/master/FRCs/frc-0069.md
 */
export function parsePieceCid(value: string): string {
  const piece = tryPieceCid(value)
  if (piece) return piece.toString()
  let legacy = false
  try {
    legacy = CID.parse(value).code === LEGACY_PIECE_CODEC
  } catch {
    // Not a CID either; fall through to the generic message.
  }
  if (legacy) {
    throw new RangeError('Legacy v1 PieceCIDs are not supported, use v2')
  }
  throw new RangeError('Expected a PieceCID v2')
}

/**
 * Every string form a CIDv1 may be recorded under: itself and, for dag-pb
 * sha2-256 CIDs, the equivalent CIDv0 (`Qm…`), which older tools emit.
 *
 * @see https://docs.ipfs.tech/concepts/content-addressing/#version-0-v0
 */
export function cidForms(cid: string): string[] {
  const parsed = CID.parse(cid)
  if (parsed.code === DAG_PB_CODEC && parsed.multihash.code === SHA2_256_CODE) {
    return [parsed.toV1().toString(), parsed.toV0().toString()]
  }
  return [cid]
}
