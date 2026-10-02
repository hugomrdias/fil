import { defineCommand } from 'clipact'
import * as z from 'zod'
import { account, accountEnv } from './shared.ts'

/** `fil status`: session, scope expiries, and funding readiness. */
export const status = defineCommand({
  name: 'status',
  description: 'Show the session, scope expiries, and funding readiness',
  examples: ['fil status', 'fil status --network mainnet'],
  input: z.strictObject(account),
  env: accountEnv,
  secrets: ['sessionKey'],
  output: z.object({
    network: z.string(),
    session: z.object({
      state: z.enum(['none', 'pending', 'active']),
      source: z.enum(['env', 'config']).optional(),
      address: z.string().optional(),
      rootAddress: z.string().optional(),
      url: z.string().optional().describe('Approval link of a pending login'),
      scopes: z
        .record(z.string(), z.string())
        .optional()
        .describe('Expiry per scope, or "expired" or "not granted"'),
    }),
    account: z
      .object({
        token: z.literal('USDFC'),
        funds: z.string(),
        availableFunds: z.string(),
        debt: z.string(),
        ready: z.boolean().describe('Ready to pay for a new 1 MiB upload'),
        needsApproval: z.boolean(),
        depositNeeded: z.string(),
        fundingUrl: z.string().optional(),
      })
      .optional(),
  }),
  readOnly: true,
  human: ({ network, session, account }) => {
    const lines = [`network: ${network}`, `session: ${session.state}`]
    if (session.url) lines.push(`approve at: ${session.url}`)
    if (session.rootAddress) lines.push(`wallet: ${session.rootAddress}`)
    for (const [scope, expiry] of Object.entries(session.scopes ?? {})) {
      lines.push(`  ${scope}: ${expiry}`)
    }
    if (account) {
      lines.push(
        `funds: ${account.availableFunds} of ${account.funds} USDFC available`,
        `ready: ${account.ready ? 'yes' : 'no'}`
      )
      if (account.fundingUrl) lines.push(`fund at: ${account.fundingUrl}`)
    }
    return lines.join('\n')
  },
  handler: () => import('../handlers/status.ts'),
})
