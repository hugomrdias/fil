import { defineHandler } from 'clipact'
import { ls } from '../../commands/operations/ls.ts'
import { listOperations } from '../../state/operations.ts'
import { accountScope, appFor } from '../context.ts'

/** List operations, most recently updated first, one page at a time. */
export default defineHandler(ls, (ctx) => {
  const app = appFor(ctx.input)
  const page = listOperations(app.db(), {
    ...accountScope(app),
    limit: ctx.input.limit,
    cursor: ctx.input.cursor,
    incomplete: ctx.input.incomplete,
  })
  return ctx.ok({
    network: app.network,
    operations: page.items.map((op) => ({
      id: op.id,
      action: op.action,
      resourceRef: op.resourceRef,
      phase: op.phase,
      executionStatus: op.executionStatus,
      updatedAt: op.updatedAt,
      ...(op.error ? { error: op.error } : {}),
    })),
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  })
})
