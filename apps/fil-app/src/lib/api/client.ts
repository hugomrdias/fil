import createClient from 'openapi-fetch'
import { env } from '@/config/env'
import type { components, paths } from './schema'

/** fil-api component schemas. */
export type Schemas = components['schemas']
/** Storage provider. */
export type Provider = Schemas['Provider']
/** Warm Storage data set. */
export type DataSet = Schemas['DataSet']
/** Piece in a data set. */
export type Piece = Schemas['Piece']
/** Piece with its data set owner and provider. */
export type PieceWithDataSet = Schemas['PieceWithDataSet']
/** Filecoin Pay rail. */
export type Rail = Schemas['Rail']
/** Rail settlement event. */
export type Settlement = Schemas['Settlement']
/** Session key authorization. */
export type SessionKey = Schemas['SessionKey']
/** Session key authorization event. */
export type SessionKeyEvent = Schemas['SessionKeyEvent']

/**
 * Typed fil-api REST client.
 *
 * @see https://openapi-ts.dev/openapi-fetch/
 */
export const api = createClient<paths>({ baseUrl: env.filApiUrl })

/** Error returned by fil-api (`{ error: { code, message } }`). */
export class ApiError extends Error {
  /** HTTP status code. */
  status: number
  /** fil-api error code, e.g. `not_found`. */
  code: string

  /**
   * @param status - HTTP status code.
   * @param code - fil-api error code.
   * @param message - Error message.
   */
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  /**
   * Check whether an error is a fil-api 404.
   *
   * @param error - Any thrown value.
   */
  static isNotFound(error: unknown) {
    return error instanceof ApiError && error.status === 404
  }
}

/**
 * Return response data or throw an {@link ApiError}.
 *
 * @param result - openapi-fetch result.
 */
export function unwrap<T>(result: {
  data?: T
  error?: unknown
  response: Response
}): T {
  if (result.data !== undefined) {
    return result.data
  }
  const body = result.error as
    | { error?: { code?: string; message?: string } }
    | undefined
  throw new ApiError(
    result.response.status,
    body?.error?.code ?? 'http_error',
    body?.error?.message ?? result.response.statusText
  )
}
