import type { Hook } from '@hono/zod-openapi'
import type { AppEnv } from '../types.ts'

/**
 * Turn request validation failures into `400 invalid_request` responses.
 */
// biome-ignore lint/suspicious/noExplicitAny: shared across routes with different inputs
export const validationHook: Hook<any, AppEnv, any, any> = (result, c) => {
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }))
    return c.json(
      {
        error: {
          code: 'invalid_request',
          message: issues
            .map((i) => `${i.path || 'query'}: ${i.message}`)
            .join('; '),
          issues,
        },
      },
      400
    )
  }
}
