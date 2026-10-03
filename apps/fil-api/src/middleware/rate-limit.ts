import { createMiddleware } from 'hono/factory'
import { ApiError } from '../errors.ts'
import type { AppEnv } from '../types.ts'

/** Rate limiter binding names declared in `wrangler.jsonc`. */
type RateLimitBinding = 'RATE_LIMIT_API' | 'RATE_LIMIT_MCP'

/**
 * Limit requests per client IP with a Workers Rate Limiting binding.
 *
 * @see https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
 */
export function rateLimit(binding: RateLimitBinding) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
    const { success } = await c.env[binding].limit({ key: `${binding}:${ip}` })
    if (!success) {
      c.header('Retry-After', '60')
      throw new ApiError(429, 'rate_limited', 'Too many requests, retry later')
    }
    await next()
  })
}
