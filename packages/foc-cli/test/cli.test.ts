import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cli } from '../src/cli.ts'
import { tempDir } from './helpers.ts'

/** Run the CLI in-process with isolated config and state directories. */
async function run(argv: string[]) {
  const dir = await tempDir()
  const saved = { ...process.env }
  process.env.FOC_CONFIG_DIR = `${dir}/config`
  process.env.FOC_STATE_DIR = `${dir}/state`
  delete process.env.FOC_SESSION_KEY
  delete process.env.FOC_ROOT_ADDRESS
  delete process.env.FOC_NETWORK
  let output = ''
  let exitCode = 0
  try {
    await cli.serve(argv, {
      stdout: (chunk) => {
        output += chunk
      },
      exit: (code) => {
        exitCode = code
      },
    })
  } finally {
    process.env = saved
  }
  return { output, exitCode, json: () => JSON.parse(output) }
}

test('ls without a session returns an action-required error', async () => {
  const result = await run(['ls', '--json'])
  assert.equal(result.exitCode, 3)
  assert.equal(result.json().code, 'NOT_LOGGED_IN')
  assert.equal(result.json().cta.commands[0].command, 'foc login')
})

test('put without a session exits before touching the network', async () => {
  const result = await run(['put', './missing', '--json'])
  assert.equal(result.exitCode, 3)
  assert.equal(result.json().code, 'NOT_LOGGED_IN')
})

test('publish is an alias of put', async () => {
  const result = await run(['publish', './missing', '--json'])
  assert.equal(result.json().code, 'NOT_LOGGED_IN')
})

test('invalid scopes are rejected as invalid input', async () => {
  const result = await run(['login', '--scopes', 'nope', '--json'])
  assert.equal(result.exitCode, 2)
  assert.equal(result.json().code, 'INVALID_INPUT')
})

test('logout without a session is a no-op', async () => {
  const result = await run(['logout', '--json', '--network', 'mainnet'])
  assert.equal(result.exitCode, 0)
  assert.deepEqual(result.json(), { network: 'mainnet', removed: false })
})
