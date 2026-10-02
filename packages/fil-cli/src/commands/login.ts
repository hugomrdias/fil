import { defineCommand } from 'clipact'
import * as z from 'zod'
import { SCOPE_IDS } from '../auth/scope-ids.ts'
import { ErrorCodes } from '../errors.ts'
import { account, accountEnv } from './shared.ts'

/**
 * `fil login`: authorize a session key in the pay.filecoin.cloud console. A
 * human waits for approval; an agent gets the approval link back as a
 * `login_pending` error and runs `fil login` again once the user approves.
 */
export const login = defineCommand({
  name: 'login',
  description: 'Authorize a session key in the pay.filecoin.cloud console',
  examples: [
    'fil login',
    'fil login --scopes createDataSet --scopes addPieces',
    'fil login --network mainnet --fresh',
  ],
  input: z.strictObject({
    network: account.network,
    sessionKey: account.sessionKey,
    scopes: z
      .array(z.enum(SCOPE_IDS))
      .min(1)
      .optional()
      .describe(
        'Scopes to request (default: createDataSet, addPieces, schedulePieceRemovals)'
      ),
    wait: z
      .boolean()
      .optional()
      .describe('Wait for approval (default: only when a human is present)'),
    open: z
      .boolean()
      .default(true)
      .describe('Open the console in a browser; never for agents'),
    fresh: z.boolean().default(false).describe('Always generate a new key'),
    timeout: z
      .number()
      .int()
      .min(1)
      .default(600)
      .describe('Seconds to wait for approval'),
  }),
  env: { network: accountEnv.network, sessionKey: accountEnv.sessionKey },
  secrets: ['sessionKey'],
  output: z.object({
    network: z.string(),
    address: z.string().describe('Session key address'),
    rootAddress: z.string().describe('Wallet that authorized it'),
    scopes: z.array(z.enum(SCOPE_IDS)).describe('Granted scopes'),
    expiresAt: z.string().optional().describe('Earliest scope expiry'),
  }),
  errors: [ErrorCodes.loginPending, ErrorCodes.permissionDenied],
  idempotent: true,
  human: (data) =>
    `Logged in on ${data.network} as ${data.rootAddress} with ${data.scopes.join(', ')}${data.expiresAt ? ` until ${data.expiresAt}` : ''}.`,
  handler: () => import('../handlers/login.ts'),
})
