import type { Hook } from '@hono/zod-openapi'
import { errorBody, unknownNetwork } from '../errors.ts'
import { isNetworkName } from '../networks.ts'
import type { AppEnv } from '../types.ts'

/**
 * Turn request validation failures into `400 invalid_request` responses.
 * An unsupported `{network}` path segment is a `404 unknown_network`
 * instead, whichever input failed first: network middleware only matches
 * supported networks, so route validation is the first to see it.
 */
// biome-ignore lint/suspicious/noExplicitAny: shared across routes with different inputs
export const validationHook: Hook<any, AppEnv, any, any> = (result, c) => {
  if (!result.success) {
    const network = c.req.param('network')
    if (network !== undefined && !isNetworkName(network)) {
      throw unknownNetwork(network)
    }
    const issues = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }))
    const message = issues
      .map((i) => `${i.path || 'query'}: ${i.message}`)
      .join('; ')
    return c.json(errorBody('invalid_request', message, issues), 400)
  }
}
