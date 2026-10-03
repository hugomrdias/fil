import { createMiddleware } from 'hono/factory'
import { type DbFactory, openNetworkDb } from '../db.ts'
import { networkUnavailable, unknownNetwork } from '../errors.ts'
import { isNetworkName, NETWORK_NAMES } from '../networks.ts'
import type { AppEnv } from '../types.ts'

/**
 * Route pattern for paths under a supported network. Other first segments,
 * such as `/sitemap.xml`, skip network middleware and rate limiting.
 *
 * @see https://hono.dev/docs/api/routing#regexp
 */
export const NETWORK_PATH = `/:network{${NETWORK_NAMES.join('|')}}/*`

/**
 * Resolve the `:network` path segment to its config and a database client,
 * closing the client after the response. Mount on {@link NETWORK_PATH}.
 */
export function networkMiddleware(dbFactory: DbFactory) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const name = c.req.param('network') ?? ''
    if (!isNetworkName(name)) throw unknownNetwork(name)
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
