import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sessionKeyRegistry } from '@filoz/synapse-core/abis'
import { calibration } from '@filoz/synapse-core/chains'
import {
  type Address,
  createPublicClient,
  custom,
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  numberToHex,
  parseUnits,
} from 'viem'
import {
  buildAuthorizeUrl,
  buildFundingUrl,
  classifyScopes,
  findAuthorizer,
  LOG_WINDOW,
} from '../src/auth/login.ts'
import { SCOPES } from '../src/auth/scopes.ts'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const SIGNER = '0x2222222222222222222222222222222222222222' as Address
const OTHER = '0x3333333333333333333333333333333333333333' as Address

test('buildAuthorizeUrl matches the console link contract', () => {
  const url = new URL(
    buildAuthorizeUrl({
      consoleUrl: 'https://pay.filecoin.cloud',
      address: '0xAbCdEf0000000000000000000000000000000001',
      scopes: ['createDataSet', 'addPieces'],
      network: 'calibration',
    })
  )
  assert.equal(url.pathname, '/console/session-keys')
  assert.equal(
    url.searchParams.get('authorize'),
    '0xabcdef0000000000000000000000000000000001'
  )
  assert.equal(url.searchParams.get('scopes'), 'createDataSet,addPieces')
  assert.equal(url.searchParams.get('network'), 'calibration')
})

test('buildFundingUrl prefills a decimal deposit only when positive', () => {
  const url = new URL(
    buildFundingUrl({
      consoleUrl: 'https://pay.filecoin.cloud',
      network: 'mainnet',
      deposit: parseUnits('1.5', 18),
    })
  )
  assert.equal(url.searchParams.get('deposit'), '1.5')
  assert.equal(url.searchParams.get('operator'), 'fwss')
  assert.equal(url.searchParams.get('network'), 'mainnet')
  assert.equal(
    buildFundingUrl({
      consoleUrl: 'https://pay.filecoin.cloud',
      network: 'mainnet',
      deposit: 0n,
    }),
    'https://pay.filecoin.cloud/console'
  )
})

test('classifyScopes splits live and missing scopes', () => {
  const grants = classifyScopes(
    ['createDataSet', 'addPieces', 'schedulePieceRemovals'],
    {
      [SCOPES.createDataSet]: 200n,
      [SCOPES.addPieces]: 150n,
      [SCOPES.schedulePieceRemovals]: 50n,
    },
    100n
  )
  assert.deepEqual(grants, {
    granted: ['createDataSet', 'addPieces'],
    missing: ['schedulePieceRemovals'],
    expiresAt: 150n,
  })
})

/** Encode an `AuthorizationsUpdated` log. */
function authorizationLog(identity: Address, signer: Address, block: bigint) {
  const event = getAbiItem({
    abi: sessionKeyRegistry,
    name: 'AuthorizationsUpdated',
  })
  return {
    address: calibration.contracts.sessionKeyRegistry.address,
    topics: encodeEventTopics({
      abi: [event],
      eventName: 'AuthorizationsUpdated',
      args: { identity },
    }),
    data: encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32[]' },
        { type: 'string' },
      ],
      [signer, 9999999999n, [SCOPES.addPieces], 'fil']
    ),
    blockNumber: numberToHex(block),
    blockHash: `0x${'ab'.repeat(32)}`,
    transactionHash: `0x${'cd'.repeat(32)}`,
    transactionIndex: '0x0',
    logIndex: '0x0',
    removed: false,
  }
}

test('findAuthorizer scans bounded windows and matches the signer', async () => {
  const latest = 1000n + LOG_WINDOW * 2n
  const ranges: [bigint, bigint][] = []
  const client = createPublicClient({
    chain: calibration,
    transport: custom({
      request({ method, params }) {
        if (method === 'eth_blockNumber') {
          return Promise.resolve(numberToHex(latest))
        }
        if (method === 'eth_getLogs') {
          const [filter] = params as [{ fromBlock: string; toBlock: string }]
          const from = BigInt(filter.fromBlock)
          const to = BigInt(filter.toBlock)
          ranges.push([from, to])
          const logs = []
          if (from <= 1500n && 1500n <= to) {
            logs.push(authorizationLog(OTHER, OTHER, 1500n))
          }
          if (from <= latest && latest <= to) {
            logs.push(authorizationLog(OWNER, SIGNER, latest))
          }
          return Promise.resolve(logs)
        }
        return Promise.reject(new Error(`Unexpected ${method}`))
      },
    }),
  })
  const owner = await findAuthorizer({
    client,
    signer: SIGNER,
    fromBlock: 1000n,
  })
  assert.equal(owner, OWNER)
  assert.equal(ranges[0]?.[0], 1000n)
  assert.equal(ranges.at(-1)?.[1], latest)
  for (const [from, to] of ranges) assert.ok(to - from <= LOG_WINDOW)

  const none = await findAuthorizer({ client, signer: OTHER, fromBlock: 0n })
  assert.equal(none, OTHER)
})
