import { defineHandler } from 'clipact'
import { inspect } from '../../commands/operations/inspect.ts'
import { appFor, findOperation } from '../context.ts'

/**
 * Show a saved operation with its input and checkpoint. The signed commit's
 * `extraData` is left out: it is long and only useful to `resume`.
 */
export default defineHandler(inspect, (ctx) => {
  const app = appFor(ctx)
  const op = findOperation(app, ctx.input.id)
  const { commit, ...checkpoint } = op.checkpoint
  return ctx.ok({
    ...op,
    checkpoint: {
      ...checkpoint,
      ...(commit
        ? {
            commit: {
              created: commit.created,
              nonce: commit.nonce,
              ...(commit.clientDataSetId
                ? { clientDataSetId: commit.clientDataSetId }
                : {}),
            },
          }
        : {}),
    },
  })
})
