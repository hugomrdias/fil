import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_SCOPES,
  expiryFromDays,
  parseScopes,
  requestedScopes,
  setupSearchSchema,
  toSetupSearch,
} from '../src/lib/setup-request.ts'

const SIGNER = '0xAbCdEf0000000000000000000000000000000001'

describe('setupSearchSchema', () => {
  it('keeps a valid link and lowercases the signer', () => {
    assert.deepEqual(
      setupSearchSchema.parse({
        network: 'calibration',
        signer: SIGNER,
        name: ' fil ',
        scopes: 'createDataSet,addPieces',
        days: '7',
        deposit: '1.5',
      }),
      {
        network: 'calibration',
        signer: SIGNER.toLowerCase(),
        name: 'fil',
        scopes: 'createDataSet,addPieces',
        days: '7',
        deposit: '1.5',
      }
    )
  })

  it('drops invalid values instead of failing', () => {
    const search = setupSearchSchema.parse({
      network: 'devnet',
      signer: '0x1234',
      name: '',
      scopes: 'transferFunds',
      days: '400',
      deposit: '0',
    })
    assert.ok(Object.values(search).every((value) => value === undefined))
  })
})

describe('scopes', () => {
  it('keeps known scopes in display order', () => {
    assert.deepEqual(parseScopes('addPieces, nope,createDataSet'), [
      'createDataSet',
      'addPieces',
    ])
    assert.equal(parseScopes('nope'), undefined)
  })

  it('falls back to the default scopes', () => {
    assert.deepEqual(requestedScopes(undefined), DEFAULT_SCOPES)
    assert.deepEqual(requestedScopes('terminateService'), ['terminateService'])
  })
})

describe('toSetupSearch', () => {
  it('builds search params from an agent request', () => {
    assert.deepEqual(
      toSetupSearch({
        network: 'mainnet',
        signer: SIGNER,
        scopes: ['addPieces'],
        days: 10,
      }),
      {
        search: {
          network: 'mainnet',
          signer: SIGNER.toLowerCase(),
          scopes: 'addPieces',
          days: '10',
        },
      }
    )
  })

  it('reports an unknown scope once', () => {
    const result = toSetupSearch({ signer: SIGNER, scopes: ['transferFunds'] })
    assert.ok('errors' in result)
    assert.equal(result.errors.length, 1)
  })

  it('reports every problem', () => {
    const result = toSetupSearch({
      scopes: ['addPieces', 'transferFunds'],
      days: 0,
    })
    assert.ok('errors' in result)
    assert.deepEqual(result.errors, [
      'days must be a whole number from 1 to 365.',
      'Unknown scopes: transferFunds. Use: createDataSet, addPieces, schedulePieceRemovals, terminateService.',
      'name, scopes, and days need a signer.',
    ])
  })

  it('reports a request of the wrong shape instead of throwing', () => {
    assert.deepEqual(toSetupSearch(null), {
      errors: ['The request must be an object.'],
    })
    assert.deepEqual(
      toSetupSearch({ signer: SIGNER, scopes: 'createDataSet,addPieces' }),
      {
        errors: [
          'scopes must be an array of: createDataSet, addPieces, schedulePieceRemovals, terminateService.',
        ],
      }
    )
    assert.deepEqual(toSetupSearch({ network: 1, deposit: 2 }), {
      errors: [
        'network must be one of: mainnet, calibration.',
        'deposit must be a positive USDFC amount, e.g. "1.5".',
      ],
    })
  })
})

describe('expiryFromDays', () => {
  it('adds whole days to the current second', () => {
    assert.equal(expiryFromDays(2, 1_000_500), 1000n + 2n * 86_400n)
  })
})
