import { defineCommand } from 'clipact'
import * as z from 'zod'
import { ErrorCodes } from '../../errors.ts'
import { account, accountEnv, executionStatus } from '../shared.ts'

/** `foc operations inspect <id>`: the saved record and its checkpoint. */
export const inspect = defineCommand({
  name: 'inspect',
  description: 'Show an operation with its saved input and checkpoint',
  examples: ['foc operations inspect op_abc123'],
  input: z.strictObject({
    id: z.string().describe('Operation ID (op_…)'),
    ...account,
  }),
  positionals: ['id'],
  env: accountEnv,
  secrets: ['sessionKey'],
  output: z.object({
    id: z.string(),
    action: z.enum(['put', 'delete']),
    resourceRef: z.string(),
    chainId: z.string(),
    payer: z.string(),
    executionStatus,
    phase: z.string(),
    input: z.record(z.string(), z.unknown()),
    checkpoint: z.record(z.string(), z.unknown()),
    pid: z.number().int().optional(),
    error: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  errors: [
    ErrorCodes.authRequired,
    ErrorCodes.loginPending,
    ErrorCodes.notFound,
  ],
  readOnly: true,
  handler: () => import('../../handlers/operations/inspect.ts'),
})
