import { defineCommand } from 'clipact'
import * as z from 'zod'
import { JOB_ERRORS } from '../../errors.ts'
import { account, accountEnv, jobResult } from '../shared.ts'

/**
 * `fil operations resume <id>`: continue an unfinished put or delete with its
 * saved input. Safe to repeat: it reconciles saved submissions before sending
 * anything, and a completed operation returns its saved outcome.
 */
export const resume = defineCommand({
  name: 'resume',
  description: 'Continue an unfinished operation with its saved input',
  examples: ['fil operations resume op_abc123'],
  input: z.strictObject({
    id: z.string().describe('Operation ID (op_…)'),
    ...account,
  }),
  positionals: ['id'],
  env: accountEnv,
  secrets: ['sessionKey'],
  output: z.object(jobResult),
  errors: JOB_ERRORS,
  idempotent: true,
  human: (data) =>
    data.state === 'ready'
      ? `Stored ${data.resource.name} (${data.resource.ref})\n${data.urls.ipfs ?? data.urls.piece}`
      : `Removal of ${data.resource.ref} (${data.resource.name}) scheduled.`,
  handler: () => import('../../handlers/operations/resume.ts'),
})
