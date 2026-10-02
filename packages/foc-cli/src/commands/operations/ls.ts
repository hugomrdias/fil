import { defineCommand } from 'clipact'
import * as z from 'zod'
import { ErrorCodes } from '../../errors.ts'
import { account, accountEnv, operationSummary, paging } from '../shared.ts'

/** `foc operations ls`: saved put and delete jobs, newest update first. */
export const ls = defineCommand({
  name: 'ls',
  description: 'List put and delete operations, most recently updated first',
  examples: ['foc operations ls', 'foc operations ls --incomplete'],
  input: z.strictObject({
    ...paging,
    incomplete: z
      .boolean()
      .default(false)
      .describe('Only operations that have not completed'),
    ...account,
  }),
  env: accountEnv,
  secrets: ['sessionKey'],
  output: z.object({
    network: z.string(),
    operations: z.array(operationSummary),
    nextCursor: z.string().optional(),
  }),
  errors: [ErrorCodes.authRequired, ErrorCodes.loginPending],
  readOnly: true,
  human: (data) =>
    data.operations.length === 0
      ? `No operations on ${data.network}.`
      : [
          ...data.operations.map(
            (op) =>
              `${op.id}  ${op.action.padEnd(6)} ${op.executionStatus.padEnd(9)} ${op.phase.padEnd(10)} ${op.resourceRef}${op.error ? `  ${op.error}` : ''}`
          ),
          ...(data.nextCursor ? [`more: --cursor ${data.nextCursor}`] : []),
        ].join('\n'),
  handler: () => import('../../handlers/operations/ls.ts'),
})
