import { createMiddleware, createStart } from '@tanstack/react-start'

/**
 * WebMCP origin-trial token for `https://fil-app.hugomrdias.dev`, which
 * expires on 2027-03-30. Renew it before then, or remove it when the trial
 * ends.
 *
 * @see https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241
 */
const WEBMCP_ORIGIN_TRIAL =
  'AhlfIhMveG7Mf8JN9RXrWtptkuF2m0akoxfxk22MtD0F/Q6jpLW0SVPM8fogovxFgHOMjSss4B7b54tSnJUoPw4AAABWeyJvcmlnaW4iOiJodHRwczovL2ZpbC1hcHAuaHVnb21yZGlhcy5kZXY6NDQzIiwiZmVhdHVyZSI6IldlYk1DUCIsImV4cGlyeSI6MTgwNjM2NDgwMH0='

/** Headers sent with every response the Worker renders. */
const RESPONSE_HEADERS = {
  'Origin-Trial': WEBMCP_ORIGIN_TRIAL,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
}

/**
 * Add the security and origin-trial headers. Static assets skip the Worker,
 * so `public/_headers` covers them instead.
 *
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/middleware
 */
const responseHeaders = createMiddleware().server(async ({ next }) => {
  const result = await next()
  for (const [name, value] of Object.entries(RESPONSE_HEADERS)) {
    result.response.headers.set(name, value)
  }
  return result
})

/**
 * TanStack Start instance with the global request middleware.
 *
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/middleware#global-middleware
 */
export const startInstance = createStart(() => ({
  requestMiddleware: [responseHeaders],
}))
