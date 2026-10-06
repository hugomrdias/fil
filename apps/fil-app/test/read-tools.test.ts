import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  accountSummaryResult,
  dataSetResult,
  listDataSetsInput,
  listPiecesInput,
  lookupPieceInput,
  pieceResult,
  sessionKeyResult,
} from '../src/lib/read-tools.ts'
import { parseToolInput, toInputSchema } from '../src/lib/webmcp.ts'

const OWNER = '0xB959b6fF9ED21CfD15EEC2BEC15d1C5b87df7F42'
const CID = 'bafkzcibd6qdqm52lehedaebnfgf2xkzjdkodqr72cer7yhajmmvo3sfsbgcaikrz'
const LINKS = {
  app: 'https://fil-app.example',
  api: 'https://fil-api.example',
}

describe('parseToolInput', () => {
  it('parses a valid input and lowercases addresses', () => {
    assert.deepEqual(
      parseToolInput(listDataSetsInput, { owner: OWNER, limit: 5 }),
      { ok: true, data: { owner: OWNER.toLowerCase(), limit: 5 } }
    )
  })

  it('treats a missing input as empty', () => {
    assert.deepEqual(parseToolInput(listDataSetsInput, undefined), {
      ok: true,
      data: {},
    })
  })

  it('accepts a data set ID as a string or a number', () => {
    for (const dataSetId of ['42', 42]) {
      const result = parseToolInput(listPiecesInput, { dataSetId })
      assert.ok(result.ok)
      assert.equal(result.data.dataSetId, '42')
    }
    assert.deepEqual(parseToolInput(listPiecesInput, { dataSetId: 'abc' }), {
      ok: false,
      errors: ['dataSetId: must be a data set ID, such as "42"'],
    })
  })

  it('reports each problem with its field', () => {
    const result = parseToolInput(listDataSetsInput, {
      owner: '0x1234',
      limit: 500,
      address: OWNER,
    })
    assert.ok(!result.ok)
    assert.deepEqual(result.errors, [
      'owner: must be a 0x-prefixed 20-byte hex address',
      'limit: Too big: expected number to be <=100',
      'Unrecognized key: "address"',
    ])
  })

  it('accepts only a PieceCID v2', () => {
    assert.deepEqual(parseToolInput(lookupPieceInput, { cid: ` ${CID} ` }), {
      ok: true,
      data: { cid: CID },
    })
    const rejected = [
      // Legacy v1 PieceCID.
      'baga6ea4seaqao7s73y24kcutaosvacpdjgfe5pw76ooefnyqw4ynr3d2y6x2mpq',
      // IPFS root CID.
      'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      'not a cid',
    ]
    for (const cid of rejected) {
      assert.deepEqual(parseToolInput(lookupPieceInput, { cid }), {
        ok: false,
        errors: ['cid: must be a PieceCID v2, starting with bafkzcib'],
      })
    }
  })
})

describe('toInputSchema', () => {
  it('describes the input as a closed JSON Schema object', () => {
    const schema = toInputSchema(listPiecesInput)
    assert.equal(schema.type, 'object')
    assert.deepEqual(schema.required, ['dataSetId'])
    assert.deepEqual(Object.keys(schema.properties), [
      'network',
      'dataSetId',
      'includeRemoved',
      'limit',
      'cursor',
    ])
    assert.equal(
      (schema as { additionalProperties?: boolean }).additionalProperties,
      false
    )
    assert.ok(!('$schema' in schema))
  })
})

describe('results', () => {
  it('links a data set to its explorer page', () => {
    const result = dataSetResult(
      {
        dataSetId: '7',
        providerId: '2',
        owner: OWNER.toLowerCase(),
        source: null,
        metadata: null,
        withCdn: null,
        withIpfsIndexing: null,
        pdpEndEpoch: null,
        deleted: null,
        createdAtBlock: '100',
        updatedAtBlock: '100',
      },
      'calibration',
      LINKS
    )
    assert.equal(result.url, 'https://fil-app.example/calibration/data-sets/7')
    assert.equal(result.deleted, false)
    assert.deepEqual(result.metadata, {})
  })

  it('links a piece to its explorer page and retrieval URL', () => {
    const result = pieceResult(
      {
        dataSetId: '7',
        pieceId: '0',
        cid: CID,
        rawSize: '1024',
        metadata: null,
        removed: false,
        addedAtBlock: '101',
        removedAtBlock: null,
        updatedAtBlock: '101',
      },
      'mainnet',
      LINKS
    )
    assert.equal(result.url, `https://fil-app.example/mainnet/pieces/${CID}`)
    assert.equal(
      result.retrievalUrl,
      `https://fil-api.example/get/${CID}?network=mainnet&browser=true`
    )
    assert.ok(!('owner' in result))
  })

  it('turns session key expiries into ISO dates', () => {
    const result = sessionKeyResult({
      identity: OWNER.toLowerCase(),
      signer: '0x6551d89b91cb6d777bb638864877ff976f47f1d1',
      active: true,
      expiry: '1793889968',
      updatedAtBlock: '4132387',
      permissions: [
        {
          permission: '0x25eb',
          name: 'CreateDataSet',
          expiry: '1793889968',
          active: true,
          origin: 'fil-cli',
          blockNumber: '4132387',
          txHash: '0xabc',
        },
        {
          permission: '0x5415',
          name: null,
          expiry: '0',
          active: false,
          origin: null,
          blockNumber: '4132387',
          txHash: '0xabc',
        },
      ],
    })
    assert.equal(result.expiresAt, '2026-11-05T14:46:08.000Z')
    assert.deepEqual(result.permissions[1], {
      name: '0x5415',
      active: false,
      expiresAt: null,
      origin: null,
    })
  })

  it('reports an unfunded account with a prefilled setup link', () => {
    const result = accountSummaryResult(
      {
        summary: {
          funds: 2_500_000_000_000_000_000n,
          availableFunds: 1_000_000_000_000_000_000n,
          debt: 0n,
          lockupRatePerEpoch: 0n,
          lockupRatePerMonth: 0n,
          runwayInEpochs: 0n,
        },
        costs: {
          ready: false,
          needsFwssMaxApproval: true,
          depositNeeded: 500_000_000_000_000_000n,
        },
      },
      'calibration',
      OWNER.toLowerCase(),
      LINKS
    )
    assert.equal(result.funds, '2.5')
    assert.equal(result.runway, null)
    assert.equal(result.warmStorageApproved, false)
    assert.equal(result.depositNeeded, '0.5')
    assert.equal(
      result.setupUrl,
      'https://fil-app.example/dashboard/setup?network=calibration&deposit=0.5'
    )
  })

  it('omits the setup link when the account is ready', () => {
    const result = accountSummaryResult(
      {
        summary: {
          funds: 1n,
          availableFunds: 1n,
          debt: 0n,
          lockupRatePerEpoch: 1n,
          lockupRatePerMonth: 86_400n,
          runwayInEpochs: 2880n,
        },
        costs: { ready: true, needsFwssMaxApproval: false, depositNeeded: 0n },
      },
      'mainnet',
      OWNER.toLowerCase(),
      LINKS
    )
    assert.equal(result.runway, '1 day')
    assert.ok(!('setupUrl' in result))
  })
})
