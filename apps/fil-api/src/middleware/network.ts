import { createMiddleware } from 'hono/factory'
import { withStats } from '../db.ts'
import { ApiError, networkUnavailable } from '../errors.ts'
import { isNetworkName, resolveNetwork } from '../networks.ts'
import type { AppEnv } from '../types.ts'

/**
 * Resolve the `:network` path segment to its config and a database client,
 * closing the client after the response.
 */
export const networkMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const name = c.req.param('network') ?? ''
  if (!isNetworkName(name)) {
    // Single-segment paths such as `/nope` are plain unknown routes.
    if (c.req.path.split('/').length <= 2) return next()
    throw new ApiError(404, 'unknown_network', `Unknown network ${name}`)
  }
  const { network, hyperdrive } = resolveNetwork(c.env, name)
  if (!hyperdrive) throw networkUnavailable(name)

  const db = c.var.dbFactory(hyperdrive)
  c.set('network', network)
  c.set('db', withStats(db, c.var.dbStats))
  try {
    await next()
  } finally {
    c.executionCtx.waitUntil(db.close())
  }
})
