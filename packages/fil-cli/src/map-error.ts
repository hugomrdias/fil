import { CliError } from 'clipact'

/** Error names from viem and iso-web for an unreachable or failing endpoint. */
const UNAVAILABLE = new Set([
  'HttpRequestError',
  'RpcRequestError',
  'WebSocketRequestError',
  'NetworkError',
  'FetchError',
  'ResourceUnavailableRpcError',
  'InternalRpcError',
  'LimitExceededRpcError',
])

/** Error names for a request that took too long. */
const TIMEOUT = new Set(['TimeoutError'])

/** The error and its causes, outermost first. */
function* causes(error: unknown): Generator<Error> {
  let current = error
  for (let depth = 0; current instanceof Error && depth < 10; depth++) {
    yield current
    current = current.cause
  }
}

/** First line of an error message, without viem's detail blocks. */
function firstLine(error: Error): string {
  return error.message.split('\n')[0] ?? error.name
}

/**
 * Translate RPC and HTTP failures from viem and synapse-core into
 * clipact's transient codes. clipact marks them retryable only for read-only
 * and idempotent commands; put and delete wrap errors with their operation
 * first, so they never reach this hook. Loaded only when a handler throws
 * something other than a `CliError`.
 *
 * @see ../../../docs/cli-framework-design.md#output-and-errors
 */
export default function mapError(error: unknown): CliError | undefined {
  for (const cause of causes(error)) {
    if (TIMEOUT.has(cause.name)) {
      return new CliError({
        code: 'timeout',
        message: `A request timed out: ${firstLine(cause)}`,
        cause: error,
      })
    }
    if (UNAVAILABLE.has(cause.name)) {
      return new CliError({
        code: 'service_unavailable',
        message: `A service did not respond: ${firstLine(cause)}`,
        cause: error,
      })
    }
  }
  return undefined
}
