import { defineCommand } from 'clipact'
import * as z from 'zod'
import { JOB_ERRORS } from '../errors.ts'
import { account, accountEnv, jobResult } from './shared.ts'

/**
 * `foc delete <ref>` (alias `rm`): schedule removal of a resource's stored
 * copy. Destructive, so it needs `--yes` when no human can confirm.
 */
export const remove = defineCommand({
  name: 'delete',
  description: 'Schedule removal of a managed resource',
  examples: ['foc delete res_abc123', 'foc rm res_abc123 --yes'],
  input: z.strictObject({
    ref: z.string().describe('Resource ref (res_…)'),
    ...account,
  }),
  positionals: ['ref'],
  env: accountEnv,
  secrets: ['sessionKey'],
  output: z.object(jobResult),
  errors: JOB_ERRORS,
  confirm: (input) =>
    `Schedules removal of ${input.ref}; the provider deletes the stored copy.`,
  human: (data) =>
    `Removal of ${data.resource.ref} (${data.resource.name}) scheduled.`,
  handler: () => import('../handlers/delete.ts'),
})
