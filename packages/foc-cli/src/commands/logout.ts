import { defineCommand } from 'clipact'
import * as z from 'zod'
import { account, accountEnv } from './shared.ts'

/** `foc logout`: forget the local session key for a network. */
export const logout = defineCommand({
  name: 'logout',
  description:
    'Forget the local session key (revoke it on-chain in the console)',
  examples: ['foc logout', 'foc logout --network mainnet'],
  input: z.strictObject({ network: account.network }),
  env: { network: accountEnv.network },
  output: z.object({
    network: z.string(),
    removed: z.boolean(),
    address: z.string().optional().describe('Forgotten session key address'),
  }),
  idempotent: true,
  human: (data) =>
    data.removed
      ? `Forgot session key ${data.address} on ${data.network}.`
      : `No session key on ${data.network}.`,
  handler: () => import('../handlers/logout.ts'),
})
