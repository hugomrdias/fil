/**
 * Spawns the built `bin/foc.js` without a TTY, as an agent harness does, and
 * checks the output contract: one JSON line on stdout, exit code 0 exactly
 * when `ok` is true, no ANSI codes, no JSON on stderr, the session key never
 * printed, and a SIGTERM turned into an `interrupted` result with exit 143.
 */
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertContract, exec } from 'clipact/testing'
import { tempDir } from './helpers.ts'

const BIN = fileURLToPath(new URL('../bin/foc.js', import.meta.url))
const SESSION_KEY = `0x${'42'.repeat(32)}`
const ROOT = '0x1111111111111111111111111111111111111111'

/** An RPC endpoint that accepts requests and never answers. */
let rpc: Server
let env: Record<string, string>

before(async () => {
  rpc = createServer(() => {
    // Hang until the client goes away.
  })
  await new Promise<void>((resolve) => rpc.listen(0, '127.0.0.1', resolve))
  const dir = await tempDir()
  env = {
    FOC_CONFIG_DIR: join(dir, 'config'),
    FOC_STATE_DIR: join(dir, 'state'),
    FOC_RPC_URL: `http://127.0.0.1:${(rpc.address() as AddressInfo).port}`,
  }
})

after(() => {
  rpc.closeAllConnections()
  rpc.close()
})

test('every outcome keeps the output contract and hides the session key', async () => {
  const withKey = { FOC_SESSION_KEY: SESSION_KEY, FOC_ROOT_ADDRESS: ROOT }
  const cases: [string[], Record<string, string>, string][] = [
    [['ls'], {}, 'auth_required'],
    [['ls', '--debug'], withKey, 'ok'],
    [['ls', '--limit', '0'], withKey, 'invalid_input'],
    [['operations', 'inspect', 'op_x'], withKey, 'not_found'],
    [['delete', 'res_x'], withKey, 'confirmation_required'],
    [['nope'], {}, 'invalid_input'],
    [['status'], {}, 'ok'],
  ]
  for (const [args, extra, expected] of cases) {
    const result = await exec(BIN, args, { env: { ...env, ...extra } })
    const json = assertContract(result)
    const outcome = json.ok
      ? 'ok'
      : (json.error as { code: string } | undefined)?.code
    assert.equal(outcome, expected, args.join(' '))
    const secret = SESSION_KEY.slice(2)
    assert.ok(!result.stdout.includes(secret), `${args.join(' ')}: stdout`)
    assert.ok(!result.stderr.includes(secret), `${args.join(' ')}: stderr`)
  }
})

test('SIGTERM interrupts a hanging command with an interrupted result', async () => {
  const result = await exec(BIN, ['login', '--wait'], {
    env,
    kill: { signal: 'SIGTERM', afterMs: 500 },
    timeoutMs: 10_000,
  })
  assert.equal(result.signal, 'SIGTERM')
  const json = assertContract({ ...result, exitCode: 1 })
  assert.equal((json.error as { code: string }).code, 'interrupted')
})
