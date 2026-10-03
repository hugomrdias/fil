import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** JSON error response body; matches `ErrorSchema` in the OpenAPI document. */
export interface ErrorBody {
  error: { code: string; message: string; issues?: unknown[] }
}

/** Build an {@link ErrorBody}. */
export function errorBody(
  code: string,
  message: string,
  issues?: unknown[]
): ErrorBody {
  return { error: issues ? { code, message, issues } : { code, message } }
}

/**
 * HTTP error with a stable machine-readable code.
 *
 * @see https://hono.dev/docs/api/exception
 */
export class ApiError extends HTTPException {
  readonly code: string

  /** Create an API error. */
  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(status, { message })
    this.name = 'ApiError'
    this.code = code
  }
}

/** Status and body for a thrown error. */
export interface ErrorResponse {
  status: ContentfulStatusCode
  body: ErrorBody
  /** True for errors that are not part of the API contract; log these. */
  unexpected: boolean
}

/**
 * Map any thrown error to a response. {@link ApiError} and Hono's
 * `HTTPException` (also thrown by `@hono/mcp`) keep their status; anything
 * else becomes a 500 whose details stay out of the body.
 */
export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: errorBody(error.code, error.message),
      unexpected: false,
    }
  }
  if (error instanceof HTTPException && error.status < 500) {
    return {
      status: error.status,
      body: errorBody('invalid_request', error.message || 'Invalid request'),
      unexpected: false,
    }
  }
  return {
    status: 500,
    body: errorBody('internal_error', 'Internal server error'),
    unexpected: true,
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
