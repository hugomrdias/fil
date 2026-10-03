import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.ts'

/**
 * Use the Cloudflare Ray ID as the request id and return it in
 * `X-Request-Id`. Workers Logs and traces index every event by the same id
 * as `$metadata.rayId`. Client-sent ids are ignored; local dev and tests,
 * which have no `cf-ray` header, fall back to a random UUID.
 *
 * @see https://developers.cloudflare.com/fundamentals/reference/cloudflare-ray-id/
 */
export const requestId = createMiddleware<AppEnv>(async (c, next) => {
  const id = c.req.header('cf-ray') ?? crypto.randomUUID()
  c.set('requestId', id)
  c.header('X-Request-Id', id)
  await next()
})
