import { defineHandler } from 'clipact'
import { logout } from '../commands/logout.ts'
import { appFor } from './context.ts'

/** Forget the saved session key for the network. */
export default defineHandler(logout, (ctx) => {
  const app = appFor(ctx.input)
  const key = `sessions.${app.network}` as const
  const session = app.config.get(key)
  if (session) app.config.delete(key)
  return ctx.ok({
    network: app.network,
    removed: session != null,
    ...(session ? { address: session.address } : {}),
  })
})
