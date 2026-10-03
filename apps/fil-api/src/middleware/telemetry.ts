import { createMiddleware } from 'hono/factory'
import { matchedRoutes } from 'hono/route'
import { setMetric } from 'hono/timing'
import { activeSpan, setAttributes } from '../tracing.ts'
import type { AppEnv } from '../types.ts'

/**
 * Annotate the invocation's root trace span with the matched route, network
 * and database query count, and add a `Server-Timing` `db` metric. Workers
 * Logs already records one invocation log per request with method, URL,
 * status and timings, so this adds no log line of its own.
 *
 * @see https://developers.cloudflare.com/workers/observability/traces/custom-spans/
 */
export const requestTelemetry = createMiddleware<AppEnv>(async (c, next) => {
  c.set('dbStats', { queries: 0, ms: 0 })
  await next()
  const stats = c.var.dbStats
  if (stats.queries > 0) {
    setMetric(c, 'db', stats.ms, `${stats.queries} queries`)
  }
  // Middleware is registered for every method (`ALL`); the last other match
  // is the endpoint that served the request. Unmatched paths have none.
  const route = matchedRoutes(c).findLast((r) => r.method !== 'ALL')?.path
  setAttributes(activeSpan(), {
    'http.route': route,
    'fil.network': c.var.network?.name,
    'fil.db.queries': stats.queries,
  })
})
