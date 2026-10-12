/**
 * Runs `fil login` in process against a fake JSON-RPC server that serves
 * the session-key registry's events and expiries. Covers how a saved key is
 * resumed, confirmed, reused, protected, and replaced.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { sessionKeyRegistry } from '@filoz/synapse-core/abis'
import { calibration } from '@filoz/synapse-core/chains'
import { assertContract, invoke } from 'clipact/testing'
import {
  type Address,
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  getAbiItem,
  type Hex,
  isAddressEqual,
  multicall3Abi,
  numberToHex,
} from 'viem'
import { SCOPES, type ScopeId } from '../src/auth/scopes.ts'
import { cli } from '../src/cli.ts'
import { openConfig, type StoredSession } from '../src/config.ts'
import { tempDir } from './helpers.ts'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const LATER = BigInt(Math.floor(Date.now() / 1000) + 86_400)
const EARLIER = BigInt(Math.floor(Date.now() / 1000) - 86_400)

/** One approval the fake registry holds. */
type Grant = {
  signer: Address
  scopes: ScopeId[]
  expiry: bigint
  block: bigint
}

/** The fake chain: its height and the approvals the owner signed. */
const chain = { block: 100n, grants: [] as Grant[] }

/** Approve `signer` for `scopes`, as fil-app's setup page would. */
function approve(signer: string, scopes: ScopeId[], expiry = LATER): void {
  chain.block += 1n
  chain.grants.push({
    signer: signer as Address,
    scopes,
    expiry,
    block: chain.block,
  })
}

/** Encode an `AuthorizationsUpdated` log for a grant. */
function authorizationLog(grant: Grant) {
  const event = getAbiItem({
    abi: sessionKeyRegistry,
    name: 'AuthorizationsUpdated',
  })
  return {
    address: calibration.contracts.sessionKeyRegistry.address,
    topics: encodeEventTopics({
      abi: [event],
      eventName: 'AuthorizationsUpdated',
      args: { identity: OWNER },
    }),
    data: encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32[]' },
        { type: 'string' },
      ],
      [
        grant.signer,
        grant.expiry,
        grant.scopes.map((scope) => SCOPES[scope]),
        'fil',
      ]
    ),
    blockNumber: numberToHex(grant.block),
    blockHash: `0x${'ab'.repeat(32)}`,
    transactionHash: `0x${'cd'.repeat(32)}`,
    transactionIndex: '0x0',
    logIndex: '0x0',
    removed: false,
  }
}

/** Answer a registry `authorizationExpiry` call. */
function expiryOf(callData: Hex): Hex {
  const { args } = decodeFunctionData({
    abi: sessionKeyRegistry,
    data: callData,
  }) as { args: readonly [Address, Address, Hex] }
  const [identity, signer, permission] = args
  let expiry = 0n
  for (const grant of chain.grants) {
    if (
      isAddressEqual(identity, OWNER) &&
      isAddressEqual(signer, grant.signer) &&
      grant.scopes.some((scope) => SCOPES[scope] === permission)
    ) {
      expiry = grant.expiry
    }
  }
  return encodeFunctionResult({
    abi: sessionKeyRegistry,
    functionName: 'authorizationExpiry',
    result: expiry,
  })
}

/** Answer one JSON-RPC request from the fake chain. */
function rpc(method: string, params: unknown[]): unknown {
  if (method === 'eth_chainId') return numberToHex(calibration.id)
  if (method === 'eth_blockNumber') return numberToHex(chain.block)
  if (method === 'eth_getLogs') {
    const [filter] = params as [{ fromBlock: Hex; toBlock: Hex }]
    const from = BigInt(filter.fromBlock)
    const to = BigInt(filter.toBlock)
    return chain.grants
      .filter((grant) => grant.block >= from && grant.block <= to)
      .map(authorizationLog)
  }
  if (method === 'eth_call') {
    const [call] = params as [{ data: Hex }]
    const { args } = decodeFunctionData({ abi: multicall3Abi, data: call.data })
    const calls = args[0] as readonly { callData: Hex }[]
    return encodeFunctionResult({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      result: calls.map((c) => ({
        success: true,
        returnData: expiryOf(c.callData),
      })),
    })
  }
  throw new Error(`Unexpected ${method}`)
}

const server = createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    const request = JSON.parse(body) as {
      id: number
      method: string
      params: unknown[]
    }
    let reply: Record<string, unknown>
    try {
      reply = { result: rpc(request.method, request.params) }
    } catch (error) {
      reply = { error: { code: -32601, message: String(error) } }
    }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...reply }))
  })
})

before(async () => {
  const dir = await tempDir()
  process.env.FIL_CONFIG_DIR = join(dir, 'config')
  process.env.FIL_STATE_DIR = join(dir, 'state')
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  process.env.FIL_RPC_URL = `http://127.0.0.1:${port}`
})

after(() => server.close())

beforeEach(() => {
  openConfig().delete('sessions.calibration')
  chain.block = 100n
  chain.grants = []
})

/** Runs `fil login` with `args` and returns the asserted JSON result. */
async function login(args: string[] = []) {
  const result = await invoke(cli, ['login', ...args], {})
  return assertContract(result) as {
    data?: Record<string, unknown>
    error?: { code: string; details?: Record<string, unknown> }
    next?: { by: string; command?: string }[]
  }
}

/** The saved calibration session. */
function saved(): StoredSession {
  const session = openConfig().get('sessions.calibration')
  assert.ok(session, 'no saved session')
  return session
}

const CUSTOM = [
  '--name',
  'logo sharing',
  '--days',
  '1',
  '--scopes',
  'createDataSet',
  '--scopes',
  'addPieces',
]

test('bare login confirms a pending key with custom scopes', async () => {
  const first = await login(CUSTOM)
  assert.equal(first.error?.code, 'login_pending')
  assert.deepEqual(
    first.next?.map((step) => step.command),
    [undefined, 'fil login --check']
  )
  const key = saved()

  approve(key.address, ['createDataSet', 'addPieces'])
  const second = await login()
  assert.deepEqual(second.data?.scopes, ['createDataSet', 'addPieces'])
  assert.equal(saved().address, key.address)
  assert.equal(saved().rootAddress, OWNER)
})

test('bare login while pending keeps the saved request', async () => {
  await login(CUSTOM)
  const key = saved()
  const again = await login()
  assert.equal(again.error?.code, 'login_pending')
  const url = new URL(String(again.error?.details?.url))
  assert.equal(url.searchParams.get('scopes'), 'createDataSet,addPieces')
  assert.equal(url.searchParams.get('name'), 'logo sharing')
  assert.equal(url.searchParams.get('days'), '1')
  assert.equal(saved().address, key.address)
})

test('--check confirms a pending key and never makes one', async () => {
  const none = await login(['--check'])
  assert.equal(none.error?.code, 'auth_required')
  assert.equal(openConfig().get('sessions.calibration'), undefined)

  await login(CUSTOM)
  const key = saved()
  assert.equal((await login(['--check'])).error?.code, 'login_pending')
  approve(key.address, ['createDataSet', 'addPieces'])
  const done = await login(['--check'])
  assert.equal(done.data?.address, key.address)

  const mixed = await login(['--check', '--fresh'])
  assert.equal(mixed.error?.code, 'invalid_input')
})

test('more scopes on a pending key that was approved keep the approval', async () => {
  await login(CUSTOM)
  const key = saved()
  approve(key.address, ['createDataSet', 'addPieces'])
  assert.equal(saved().rootAddress, undefined, 'not confirmed yet')

  const wider = await login(['--scopes', 'schedulePieceRemovals'])
  assert.equal(wider.error?.code, 'session_conflict')
  assert.equal(wider.error?.details?.state, 'approved')
  assert.equal(saved().address, key.address)
  assert.equal(saved().rootAddress, OWNER, 'the approval is saved')
  assert.deepEqual(
    wider.next?.map((step) => step.command),
    ['fil login --check', 'fil login --fresh --scopes schedulePieceRemovals']
  )
})

test('more scopes on a key still pending need --fresh', async () => {
  await login(CUSTOM)
  const key = saved()
  const wider = await login(['--scopes', 'schedulePieceRemovals'])
  assert.equal(wider.error?.code, 'session_conflict')
  assert.equal(wider.error?.details?.state, 'pending')
  assert.ok(wider.error?.details?.url)
  assert.equal(saved().address, key.address)
})

test('a subset of a saved key reuses it', async () => {
  await login(CUSTOM)
  const key = saved()
  approve(key.address, ['createDataSet', 'addPieces'])
  // Pending: the saved key is confirmed with all its scopes.
  const pending = await login(['--scopes', 'addPieces'])
  assert.deepEqual(pending.data?.scopes, ['createDataSet', 'addPieces'])
  // Approved: only the requested scopes are reported.
  const approved = await login(['--scopes', 'addPieces'])
  assert.deepEqual(approved.data?.scopes, ['addPieces'])
  assert.equal(saved().address, key.address)
})

test('--fresh replaces a key and keeps its request', async () => {
  await login(CUSTOM)
  const key = saved()
  approve(key.address, ['createDataSet', 'addPieces'])
  const fresh = await login(['--fresh'])
  assert.equal(fresh.error?.code, 'login_pending')
  const next = saved()
  assert.notEqual(next.address, key.address)
  assert.deepEqual(next.scopes, ['createDataSet', 'addPieces'])
  assert.equal(next.name, 'logo sharing')
  assert.equal(next.days, 1)
})

test('an expired key is renewed with the same request', async () => {
  await login(CUSTOM)
  const key = saved()
  approve(key.address, ['createDataSet', 'addPieces'], EARLIER)
  // The approval was found while it was live.
  openConfig().set('sessions.calibration', { ...key, rootAddress: OWNER })

  const check = await login(['--check'])
  assert.equal(check.error?.code, 'session_expired')
  assert.equal(saved().address, key.address)

  const renewed = await login()
  assert.equal(renewed.error?.code, 'login_pending')
  const next = saved()
  assert.notEqual(next.address, key.address)
  assert.deepEqual(next.scopes, ['createDataSet', 'addPieces'])
  assert.equal(next.name, 'logo sharing')
})

test('a key approved with fewer scopes is permission_denied', async () => {
  await login()
  const key = saved()
  approve(key.address, ['addPieces'])
  const result = await login()
  assert.equal(result.error?.code, 'permission_denied')
  assert.equal(saved().address, key.address)
  assert.equal((await login()).error?.code, 'permission_denied')
  assert.equal(saved().address, key.address)
})
