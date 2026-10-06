import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Resource } from '../src/state/resources.ts'
import {
  providerPieceUrl,
  resourceUrls,
  retrievalUrls,
} from '../src/storage/urls.ts'

const PIECE_CID =
  'bafkzcibcd4bdomn3tgwgrh3g532zopskstnbrd2n3sxfqbze7rxt7vqn7veigmy'
const ROOT_CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

/** A stored artifact on calibration with one copy. */
const artifact: Resource = {
  ref: 'res_1',
  kind: 'artifact',
  name: 'site',
  chainId: '314159',
  payer: '0xabc',
  pieceCid: PIECE_CID,
  rootCid: ROOT_CID,
  size: 1024,
  copies: [
    {
      providerId: '7',
      dataSetId: '1',
      pieceId: '0',
      serviceURL: 'https://sp.example/base',
    },
  ],
  status: 'active',
  createdAt: '2026-10-06T00:00:00.000Z',
}

test('retrievalUrls links a file to /get/{pieceCid} for both URLs', () => {
  assert.deepEqual(
    retrievalUrls({
      apiUrl: 'https://api.example',
      chainId: '314',
      pieceCid: PIECE_CID,
    }),
    {
      piece: `https://api.example/get/${PIECE_CID}?network=mainnet`,
      browser: `https://api.example/get/${PIECE_CID}?network=mainnet&browser=true`,
    }
  )
})

test('resourceUrls opens a folder by its root CID and keeps the API base path', () => {
  assert.deepEqual(resourceUrls(artifact, 'http://localhost:8787/v1'), {
    piece: `http://localhost:8787/v1/get/${PIECE_CID}?network=calibration`,
    browser: `http://localhost:8787/v1/get/${ROOT_CID}?network=calibration&browser=true`,
  })
})

test('retrievalUrls rejects an unknown chain ID', () => {
  assert.throws(
    () =>
      retrievalUrls({
        apiUrl: 'https://api.example',
        chainId: '1',
        pieceCid: PIECE_CID,
      }),
    /Unknown chain ID 1/
  )
})

test('providerPieceUrl points at the first copy for fil get', () => {
  assert.equal(
    providerPieceUrl(artifact),
    `https://sp.example/base/piece/${PIECE_CID}`
  )
})
