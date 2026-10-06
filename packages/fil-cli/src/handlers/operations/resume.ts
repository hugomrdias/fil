import { defineHandler } from 'clipact'
import { PUT_SCOPES, RM_SCOPES } from '../../auth/scopes.ts'
import { resume } from '../../commands/operations/resume.ts'
import { runOperation, savedOutcome } from '../../storage/jobs.ts'
import { appFor, findOperation, jobContext } from '../context.ts'

/**
 * Continue an unfinished operation with its saved input. A completed one
 * returns its saved outcome without loading the session key.
 */
export default defineHandler(resume, async (ctx) => {
  const app = appFor(ctx)
  const op = findOperation(app, ctx.input.id)
  if (op.executionStatus === 'completed') {
    return ctx.ok(savedOutcome({ db: app.db(), apiUrl: app.apiUrl }, op))
  }
  const scopes = op.action === 'put' ? PUT_SCOPES : RM_SCOPES
  const job = await jobContext(app, scopes, ctx)
  return ctx.ok(await runOperation(job, op.id))
})
