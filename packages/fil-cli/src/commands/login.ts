import { defineCommand } from 'clipact'
import * as z from 'zod'
import { DEFAULT_KEY_NAME, SCOPE_IDS } from '../auth/scope-ids.ts'
import { ErrorCodes } from '../errors.ts'
import { account, accountEnv } from './shared.ts'

/**
 * `fil login`: authorize a session key in the fil-app dashboard. A human
 * waits for approval; an agent gets the approval link back as a
 * `login_pending` error and runs `fil login --check` once the user approves.
 * Flags left out keep the saved key's request, and only `--fresh` replaces a
 * key that is pending or still valid.
 */
export const login = defineCommand({
  name: 'login',
  description: 'Authorize a session key in the fil-app dashboard',
  examples: [
    'fil login',
    'fil login --scopes createDataSet --scopes addPieces',
    'fil login --check',
    'fil login --name "fil on laptop" --days 7',
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
        "Scopes to request (default: the saved key's, else createDataSet, addPieces, schedulePieceRemovals)"
      ),
    name: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional()
      .describe(
        `Key name the owner sees, recorded on chain (default: the saved key's, else ${DEFAULT_KEY_NAME})`
      ),
    days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe(
        "Days until the approval expires (default: the saved key's, else 30)"
      ),
    wait: z
      .boolean()
      .optional()
      .describe('Wait for approval (default: only when a human is present)'),
    open: z
      .boolean()
      .default(true)
      .describe('Open the approval page in a browser; never for agents'),
    fresh: z
      .boolean()
      .default(false)
      .describe('Generate a new key, replacing a pending or valid saved key'),
    check: z
      .boolean()
      .default(false)
      .describe('Only confirm the saved key; never generate a new one'),
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
  errors: [
    ErrorCodes.authRequired,
    ErrorCodes.loginPending,
    ErrorCodes.permissionDenied,
    ErrorCodes.sessionConflict,
    ErrorCodes.sessionExpired,
  ],
  idempotent: true,
  human: (data) =>
    `Logged in on ${data.network} as ${data.rootAddress} with ${data.scopes.join(', ')}${data.expiresAt ? ` until ${data.expiresAt}` : ''}.`,
  handler: () => import('../handlers/login.ts'),
})
