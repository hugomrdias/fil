import { defineHandler } from 'clipact'
import { RM_SCOPES } from '../auth/scopes.ts'
import { remove } from '../commands/delete.ts'
import { startRemove } from '../storage/jobs.ts'
import { appFor, jobContext } from './context.ts'

/** Schedule removal of a managed resource's stored copy. */
export default defineHandler(remove, async (ctx) => {
  const app = appFor(ctx.input)
  const job = await jobContext(app, RM_SCOPES, ctx)
  const result = await startRemove(job, ctx.input.ref)
  return ctx.ok(result)
})
