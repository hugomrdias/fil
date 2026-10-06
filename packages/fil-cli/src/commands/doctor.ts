import { defineCommand } from 'clipact'
import * as z from 'zod'
import { account, accountEnv } from './shared.ts'

/** A resolved setting and where its value came from. */
const setting = z.object({
  value: z.string(),
  source: z
    .enum(['input', 'env', 'config', 'default'])
    .describe('input means --network or FIL_NETWORK'),
})

/**
 * `fil doctor`: resolved settings with their sources, and quick checks of the
 * state database and the RPC endpoint.
 *
 * @see ../../../../docs/agent-cli/guidelines.md#configuration-and-environment
 */
export const doctor = defineCommand({
  name: 'doctor',
  description: 'Show resolved settings and check the state database and RPC',
  examples: ['fil doctor', 'fil doctor --network mainnet'],
  input: z.strictObject(account),
  env: accountEnv,
  secrets: ['sessionKey'],
  output: z.object({
    network: setting,
    rpcUrl: setting,
    consoleUrl: setting,
    apiUrl: setting,
    configFile: z.string(),
    stateDir: setting,
    credentials: z.enum(['env', 'config', 'pending', 'none']),
    checks: z.array(
      z.object({ name: z.string(), ok: z.boolean(), message: z.string() })
    ),
  }),
  readOnly: true,
  human: (data) =>
    [
      `network: ${data.network.value} (${data.network.source})`,
      `rpc: ${data.rpcUrl.value} (${data.rpcUrl.source})`,
      `console: ${data.consoleUrl.value} (${data.consoleUrl.source})`,
      `api: ${data.apiUrl.value} (${data.apiUrl.source})`,
      `config: ${data.configFile}`,
      `state: ${data.stateDir.value} (${data.stateDir.source})`,
      `credentials: ${data.credentials}`,
      ...data.checks.map(
        (check) => `${check.ok ? 'ok' : 'FAIL'} ${check.name}: ${check.message}`
      ),
    ].join('\n'),
  handler: () => import('../handlers/doctor.ts'),
})
