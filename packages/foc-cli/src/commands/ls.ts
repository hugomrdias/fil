import { defineCommand } from 'clipact'
import * as z from 'zod'
import { ErrorCodes } from '../errors.ts'
import { account, accountEnv, formatBytes, paging } from './shared.ts'

/** `foc ls`: list managed resources, newest first, one page at a time. */
export const ls = defineCommand({
  name: 'ls',
  description: 'List managed resources, newest first',
  examples: ['foc ls', 'foc ls --all --limit 50'],
  input: z.strictObject({
    ...paging,
    all: z
      .boolean()
      .default(false)
      .describe('Include resources pending removal'),
    ...account,
  }),
  env: accountEnv,
  secrets: ['sessionKey'],
  output: z.object({
    network: z.string(),
    resources: z.array(
      z.object({
        ref: z.string(),
        kind: z.enum(['file', 'artifact']),
        name: z.string(),
        size: z.number().int(),
        status: z.enum(['active', 'removal_pending']),
        url: z.string().optional(),
        createdAt: z.string(),
      })
    ),
    nextCursor: z.string().optional(),
  }),
  errors: [ErrorCodes.authRequired, ErrorCodes.loginPending],
  readOnly: true,
  human: (data) =>
    data.resources.length === 0
      ? `No resources on ${data.network}.`
      : [
          ...data.resources.map(
            (r) =>
              `${r.ref}  ${r.kind.padEnd(8)} ${formatBytes(r.size).padStart(10)}  ${r.name}${r.status === 'active' ? '' : ` (${r.status})`}`
          ),
          ...(data.nextCursor ? [`more: --cursor ${data.nextCursor}`] : []),
        ].join('\n'),
  handler: () => import('../handlers/ls.ts'),
})
