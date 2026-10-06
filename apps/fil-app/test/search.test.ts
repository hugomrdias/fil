import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifySearch } from '../src/lib/search.ts'

const PIECE_CID =
  'bafkzcibcaapao7u5kotdcxtohbukiqxrlxqzhh6eeffkocb2jy4a5ynrfpahgvi'

describe('classifySearch', () => {
  it('detects addresses and lowercases them', () => {
    assert.deepEqual(
      classifySearch(' 0x480C51FE9FC90E01FA742C51300CC29E151A71CD '),
      {
        type: 'address',
        address: '0x480c51fe9fc90e01fa742c51300cc29e151a71cd',
      }
    )
  })

  it('detects PieceCID v2', () => {
    assert.deepEqual(classifySearch(` ${PIECE_CID} `), {
      type: 'piece',
      cid: PIECE_CID,
    })
  })

  it('normalizes hex PieceCIDs to the canonical string', () => {
    assert.deepEqual(
      classifySearch(
        '0x015591202586bdb70313ae7192454f8e556bf57b22b63b61a6313924334ed80f257e47291a377d351b3e'
      ),
      {
        type: 'piece',
        cid: 'bafkzcibfq263oaytvzyzerkprzkwx5l3ek3dwyngge4sim2o3ahsk7shfendo7jvdm7a',
      }
    )
  })

  it('flags legacy v1 PieceCIDs', () => {
    assert.deepEqual(
      classifySearch(
        'baga6ea4seaqao7s73y24kcutaosvacpdjgfe5pw76ooefnyqw4ynr3d2y6x2mpq'
      ),
      { type: 'legacy-piece' }
    )
  })

  it('normalizes numeric ids', () => {
    assert.deepEqual(classifySearch('007'), { type: 'id', id: '7' })
  })

  it('rejects anything else', () => {
    assert.equal(classifySearch('').type, 'invalid')
    assert.equal(classifySearch('0x1234').type, 'invalid')
    assert.equal(classifySearch('hello').type, 'invalid')
    assert.equal(classifySearch('12345678901234567890').type, 'invalid')
    assert.equal(classifySearch(PIECE_CID.slice(0, -4)).type, 'invalid')
    assert.equal(
      classifySearch(
        'bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy'
      ).type,
      'invalid'
    )
  })
})
