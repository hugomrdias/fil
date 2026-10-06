import { describe, expect, it } from 'vitest'
import { cidForms, parsePieceCid, parseRetrievalCid } from '../src/cid.ts'
import { rows } from './helpers.ts'

describe('parseRetrievalCid', () => {
  it('classifies PieceCID v2 as a piece', () => {
    expect(parseRetrievalCid(rows.piece.cid)).toEqual({
      kind: 'piece',
      cid: rows.piece.cid,
    })
  })

  it.each([
    [
      'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    ],
    [
      'bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy',
      'bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy',
    ],
    [
      'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      'bafybeie5nqv6kd3qnfjupgvz34woh3oksc3iau6abmyajn7qvtf6d2ho34',
    ],
  ])('classifies %s as IPFS content, normalized to CIDv1', (input, cid) => {
    expect(parseRetrievalCid(input)).toEqual({ kind: 'ipfs', cid })
  })

  it.each([
    ['baga6ea4seaqao7s73y24kcutaosvacpdjgfe5pw76ooefnyqw4ynr3d2y6x2mpq', 'v2'],
    ['0x0155a0e40220', 'Expected a CID'],
    ['nope', 'Expected a CID'],
    ['', 'Expected a CID'],
  ])('rejects %s', (input, message) => {
    expect(() => parseRetrievalCid(input)).toThrow(message)
  })
})

describe('parsePieceCid', () => {
  it.each([
    rows.piece.cid,
    '0x015591202586bdb70313ae7192454f8e556bf57b22b63b61a6313924334ed80f257e47291a377d351b3e',
  ])('normalizes %s to the canonical string', (input) => {
    expect(parsePieceCid(input)).toBe(rows.piece.cid)
  })

  it.each([
    [
      'baga6ea4seaqao7s73y24kcutaosvacpdjgfe5pw76ooefnyqw4ynr3d2y6x2mpq',
      'Legacy v1 PieceCIDs are not supported, use v2',
    ],
    ['bafkzcibfq263', 'Expected a PieceCID v2'],
    [
      'bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy',
      'Expected a PieceCID v2',
    ],
    ['notacid', 'Expected a PieceCID v2'],
  ])('rejects %s', (input, message) => {
    expect(() => parsePieceCid(input)).toThrow(message)
  })
})

describe('cidForms', () => {
  it('adds the CIDv0 form of dag-pb sha2-256 CIDs', () => {
    expect(
      cidForms('bafybeie5nqv6kd3qnfjupgvz34woh3oksc3iau6abmyajn7qvtf6d2ho34')
    ).toEqual([
      'bafybeie5nqv6kd3qnfjupgvz34woh3oksc3iau6abmyajn7qvtf6d2ho34',
      'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
    ])
  })

  it('keeps CIDs without a CIDv0 form as they are', () => {
    const raw = 'bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy'
    expect(cidForms(raw)).toEqual([raw])
  })
})
