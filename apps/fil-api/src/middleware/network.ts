import { createMiddleware } from 'hono/factory'
import type { DbFactory } from '../db.ts'
import { ApiError, networkUnavailable } from '../errors.ts'
import { isNetworkName, openNetworkDb } from '../networks.ts'
import type { AppEnv } from '../types.ts'

/**
 * Resolve the `:network` path segment to its config and a database client,
 * closing the client after the response.
 */
export function networkMiddleware(dbFactory: DbFactory) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const name = c.req.param('network') ?? ''
    if (!isNetworkName(name)) {
      // Single-segment paths such as `/nope` are plain unknown routes.
      if (c.req.path.split('/').length <= 2) return next()
      throw new ApiError(404, 'unknown_network', `Unknown network ${name}`)
    }
    const opened = openNetworkDb(c.env, name, dbFactory, c.var.dbStats)
    if (!opened) throw networkUnavailable(name)

    c.set('network', opened.network)
    c.set('db', opened.db)
    try {
      await next()
    } finally {
      c.executionCtx.waitUntil(opened.close())
    }
  })
}
