import { createMiddleware } from 'hono/factory'
import { routePath } from 'hono/route'
import { setMetric } from 'hono/timing'
import { log } from '../log.ts'
import type { AppEnv } from '../types.ts'

/**
 * Emit one structured log line per request and a `Server-Timing` `db`
 * metric.
 */
export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const start = performance.now()
  c.set('dbStats', { queries: 0, ms: 0 })
  await next()
  const stats = c.var.dbStats
  if (stats.queries > 0) {
    setMetric(c, 'db', stats.ms, `${stats.queries} queries`)
  }
  const cf = c.req.raw.cf as { colo?: string } | undefined
  log(c.res.status >= 500 ? 'error' : 'info', {
    message: 'request',
    requestId: c.var.requestId,
    method: c.req.method,
    route: routePath(c),
    path: c.req.path,
    network: c.var.network?.name,
    status: c.res.status,
    durationMs: Math.round(performance.now() - start),
    dbQueries: stats.queries,
    dbMs: Math.round(stats.ms),
    colo: cf?.colo,
  })
})
