import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** Error with an HTTP status and a stable machine-readable code. */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: string

  /** Create an API error. */
  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** 404 for a missing resource. */
export function notFound(resource: string, id: string): ApiError {
  return new ApiError(404, 'not_found', `${resource} ${id} not found`)
}

/** 503 for a network whose database is not configured. */
export function networkUnavailable(network: string): ApiError {
  return new ApiError(
    503,
    'network_unavailable',
    `Network ${network} is not available yet`
  )
}
