import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifySearch } from '../src/lib/search.ts'

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

  it('detects PieceCIDs', () => {
    const cid =
      'bafkzcibcaapao7u5kotdcxtohbukiqxrlxqzhh6eeffkocb2jy4a5ynrfpahgvi'
    assert.deepEqual(classifySearch(cid), { type: 'piece', cid })
    assert.equal(
      classifySearch(
        'baga6ea4seaqao7s73y24kcutaosvacpdjgfe5pw76ooefnyqw4ynr3d2y6x2mpq'
      ).type,
      'piece'
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
  })
})
