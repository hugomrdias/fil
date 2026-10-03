import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { retrievalUrl } from '../src/lib/retrieval.ts'

const CID =
  'bafkzcibfq263oaytvzyzerkprzkwx5l3ek3dwyngge4sim2o3ahsk7shfendo7jvdm7a'

describe('retrievalUrl', () => {
  it('points at fil-api /get with the network and browser mode', () => {
    assert.equal(
      retrievalUrl('https://fil-api.hugomrdias.dev', 'calibration', CID),
      `https://fil-api.hugomrdias.dev/get/${CID}?network=calibration&browser=true`
    )
  })

  it('keeps a base path', () => {
    assert.equal(
      retrievalUrl('http://localhost:8787/api/', 'mainnet', CID),
      `http://localhost:8787/api/get/${CID}?network=mainnet&browser=true`
    )
  })
})
