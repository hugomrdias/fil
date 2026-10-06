import { CliError, type ErrorRegistry, isCliError, type Next } from 'clipact'
import * as z from 'zod'

/**
 * Error codes `fil` returns besides clipact's built-ins. Codes are stable:
 * agents and scripts branch on them. {@link errors} describes each one.
 *
 * @see ../../../docs/agent-cli/guidelines.md#errors-next-steps-and-retries
 */
export const ErrorCodes = {
  authRequired: 'auth_required',
  loginPending: 'login_pending',
  sessionExpired: 'session_expired',
  permissionDenied: 'permission_denied',
  insufficientFunds: 'insufficient_funds',
  notFound: 'not_found',
  outputExists: 'output_exists',
  verificationFailed: 'verification_failed',
  unsafePath: 'unsafe_path',
  operationRunning: 'operation_running',
  operationFailed: 'operation_failed',
  sourceChanged: 'source_changed',
  stagingMissing: 'staging_missing',
  commitRejected: 'commit_rejected',
  removalReverted: 'removal_reverted',
} as const

/** `details` fields of a put or delete error: the operation to resume. */
const operation = {
  operationId: z
    .string()
    .optional()
    .describe(
      'Set on put and delete errors; resume it with fil operations resume'
    ),
}

/**
 * The error registry: a description and `details` schema for each code,
 * published by `fil schema <command>`.
 *
 * @see ../../../docs/agent-cli/guidelines.md#errors-next-steps-and-retries
 */
export const errors = {
  [ErrorCodes.authRequired]: {
    description: 'No session key for the network; run fil login.',
    details: z.strictObject(operation),
  },
  [ErrorCodes.loginPending]: {
    description: 'A session key waits for approval in the console.',
    details: z.strictObject({
      url: z.string().describe('Console page that approves the key'),
      ...operation,
    }),
  },
  [ErrorCodes.sessionExpired]: {
    description:
      'The session key lacks a scope the command needs, or it expired.',
    details: z.strictObject({
      missing: z.array(z.string()).describe('Scopes to authorize'),
      ...operation,
    }),
  },
  [ErrorCodes.permissionDenied]: {
    description: 'The wallet owner approved fewer scopes than requested.',
    details: z.strictObject({
      missing: z.array(z.string()).describe('Scopes not granted'),
    }),
  },
  [ErrorCodes.insufficientFunds]: {
    description: 'The payer cannot cover the upload.',
    details: z.strictObject({
      fundingUrl: z.string().describe('Console page that funds the payer'),
      depositNeeded: z.string().describe('USDFC base units to deposit first'),
      needsApproval: z
        .boolean()
        .describe('The payer must approve Warm Storage first'),
      ...operation,
    }),
  },
  [ErrorCodes.notFound]: {
    description:
      'No managed resource, operation, provider, or piece has that name.',
    details: z.strictObject(operation),
  },
  [ErrorCodes.outputExists]: {
    description: 'fil get would overwrite an existing path.',
  },
  [ErrorCodes.verificationFailed]: {
    description: 'Retrieved bytes or blocks do not match their CIDs.',
  },
  [ErrorCodes.unsafePath]: {
    description:
      'A retrieved archive tried to write outside the output directory.',
  },
  [ErrorCodes.operationRunning]: {
    description: 'Another process is running the operation.',
    details: z.strictObject(operation),
  },
  [ErrorCodes.operationFailed]: {
    description: 'A put or delete stopped; resume it.',
    details: z.strictObject(operation),
  },
  [ErrorCodes.sourceChanged]: {
    description: 'A resumed put found its source file changed.',
    details: z.strictObject(operation),
  },
  [ErrorCodes.stagingMissing]: {
    description: 'A resumed put lost its staged CAR.',
    details: z.strictObject(operation),
  },
  [ErrorCodes.commitRejected]: {
    description: 'The provider rejected the commit transaction.',
    details: z.strictObject(operation),
  },
  [ErrorCodes.removalReverted]: {
    description: 'The removal transaction reverted.',
    details: z.strictObject(operation),
  },
} satisfies ErrorRegistry

/** Errors a command that signs with the session key can return. */
const SESSION_ERRORS = [
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
    command: `fil operations resume ${operationId}`,
    description: 'Continue this operation with its saved input',
  }
}

/** Codes whose `details` schema in {@link errors} has `operationId`. */
const OPERATION_CODES: ReadonlySet<string> = new Set(
  Object.entries(errors)
    .filter(
      ([, definition]) =>
        'details' in definition && 'operationId' in definition.details.shape
    )
    .map(([code]) => code)
)

/**
 * Attach an operation to an error from a put or delete: a resume step after
 * any user step, and the operation ID in `details` for codes whose schema
 * has `operationId`. Built-in codes keep their `details` unchanged. Put and
 * delete errors are never retryable, because repeating the original command
 * starts a new paid operation; resuming continues the saved one.
 *
 * @see ../../../docs/fil/interface-research.md#the-agent-execution-contract
 */
export function operationError(error: unknown, operationId: string): CliError {
  const resume = resumeStep(operationId)
  if (isCliError(error)) {
    if (error.next?.some((step) => step.command === resume.command)) {
      return error
    }
    const details = OPERATION_CODES.has(error.code)
      ? { ...(error.details as object | undefined), operationId }
      : error.details
    return new CliError({
      code: error.code,
      message: error.message,
      retryable: false,
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
      ...(details === undefined ? {} : { details }),
      next: [...(error.next ?? []), resume],
      cause: error.cause ?? error,
    })
  }
  const message = error instanceof Error ? error.message : String(error)
  return new CliError({
    code: ErrorCodes.operationFailed,
    message: `Operation ${operationId} stopped: ${message}`,
    retryable: false,
    details: { operationId },
    next: [resume],
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
 * can report the interruption. The call's own outcome is always handled, so
 * a late failure never becomes an unhandled rejection.
 */
export function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined
): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) {
    promise.catch(() => undefined)
    return Promise.reject(signal.reason)
  }
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
