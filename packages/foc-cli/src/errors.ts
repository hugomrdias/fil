import { CliError, isCliError, type Next } from 'clipact'

/**
 * Error codes `foc` returns besides clipact's built-ins. Codes are stable:
 * agents and scripts branch on them.
 *
 * @see ../../../docs/agent-cli-guidelines.md#errors-next-steps-and-retries
 */
export const ErrorCodes = {
  /** No session key for the network. */
  authRequired: 'auth_required',
  /** A session key waits for approval in the console. */
  loginPending: 'login_pending',
  /** The session key lacks a scope the command needs, or it expired. */
  sessionExpired: 'session_expired',
  /** The owner approved fewer scopes than requested. */
  permissionDenied: 'permission_denied',
  /** The payer cannot cover the upload. */
  insufficientFunds: 'insufficient_funds',
  /** No managed resource, operation, provider, or piece by that name. */
  notFound: 'not_found',
  /** `get` would overwrite an existing path. */
  outputExists: 'output_exists',
  /** Retrieved bytes or blocks do not match their CIDs. */
  verificationFailed: 'verification_failed',
  /** A retrieved archive tried to write outside the output directory. */
  unsafePath: 'unsafe_path',
  /** Another process is running the operation. */
  operationRunning: 'operation_running',
  /** A put or delete stopped; resume it. */
  operationFailed: 'operation_failed',
  /** A resumed put found its source file changed. */
  sourceChanged: 'source_changed',
  /** A resumed put lost its staged CAR. */
  stagingMissing: 'staging_missing',
  /** The provider rejected the commit transaction. */
  commitRejected: 'commit_rejected',
  /** The removal transaction reverted. */
  removalReverted: 'removal_reverted',
} as const

/** Errors a command that signs with the session key can return. */
export const SESSION_ERRORS = [
  ErrorCodes.authRequired,
  ErrorCodes.loginPending,
  ErrorCodes.sessionExpired,
]

/** Errors any put or delete job can return, including when resumed. */
export const JOB_ERRORS = [
  ...SESSION_ERRORS,
  ErrorCodes.notFound,
  ErrorCodes.insufficientFunds,
  ErrorCodes.operationRunning,
  ErrorCodes.operationFailed,
  ErrorCodes.sourceChanged,
  ErrorCodes.stagingMissing,
  ErrorCodes.commitRejected,
  ErrorCodes.removalReverted,
]

/** The next step that continues an operation. */
export function resumeStep(operationId: string): Next {
  return {
    by: 'agent',
    command: `foc operations resume ${operationId}`,
    description: 'Continue this operation with its saved input',
  }
}

/**
 * Attach an operation to an error from a put or delete: its ID in the result
 * and a resume step after any user step. Put and delete errors are never
 * retryable, because repeating the original command starts a new paid
 * operation; resuming continues the saved one.
 *
 * @see ../../../docs/foc-cli-interface-research.md#the-agent-execution-contract
 */
export function operationError(error: unknown, operationId: string): CliError {
  if (isCliError(error)) {
    if (error.data?.operationId === operationId) return error
    return new CliError({
      code: error.code,
      message: error.message,
      retryable: false,
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
      ...(error.details === undefined ? {} : { details: error.details }),
      next: [...(error.next ?? []), resumeStep(operationId)],
      data: { ...error.data, operationId },
      cause: error.cause ?? error,
    })
  }
  const message = error instanceof Error ? error.message : String(error)
  return new CliError({
    code: ErrorCodes.operationFailed,
    message: `Operation ${operationId} stopped: ${message}`,
    retryable: false,
    next: [resumeStep(operationId)],
    data: { operationId },
    cause: error,
  })
}

/** An `invalid_input` error for a problem found after validation. */
export function invalidInput(message: string, path?: string): CliError {
  return new CliError({
    code: 'invalid_input',
    message,
    ...(path ? { details: [{ path, message }] } : {}),
  })
}

/** A `not_found` error with a step that lists what does exist. */
export function notFound(message: string, next?: Next): CliError {
  return new CliError({
    code: ErrorCodes.notFound,
    message,
    ...(next ? { next: [next] } : {}),
  })
}

/**
 * Reject when `signal` aborts, for SDK calls that cannot be cancelled. The
 * call keeps running in the background, but the handler returns so clipact
 * can report the interruption.
 */
export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined
): Promise<T> {
  if (!signal) return promise
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}
