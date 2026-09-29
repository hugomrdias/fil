import { Errors } from 'incur'

/**
 * Process exit classes from the agent execution contract.
 *
 * @see ../../../docs/foc-cli-interface-research.md#the-agent-execution-contract
 */
export const ExitCode = {
  unexpected: 1,
  invalidInput: 2,
  actionRequired: 3,
  notFound: 4,
  transient: 5,
  partial: 6,
  pending: 7,
} as const

/** A suggested next command, rendered by incur as a call to action. */
export type NextCommand = { command: string; description?: string }

/** Options for {@link FocError}. */
export type FocErrorOptions = {
  exitCode?: number
  retryable?: boolean
  cause?: unknown
  /** Commands the caller can run to resolve the error. */
  next?: NextCommand[]
  /** Structured facts that help the caller act, such as a console URL. */
  info?: Record<string, unknown>
}

/**
 * Application error with a stable code, an exit class, and optional next
 * steps. Commands convert it into an incur error result with {@link guard}.
 */
export class FocError extends Errors.IncurError {
  readonly next: NextCommand[]
  readonly info: Record<string, unknown> | undefined

  constructor(code: string, message: string, options: FocErrorOptions = {}) {
    super({
      code,
      message,
      exitCode: options.exitCode ?? ExitCode.unexpected,
      retryable: options.retryable ?? false,
      cause: options.cause instanceof Error ? options.cause : undefined,
    })
    this.name = 'FocError'
    this.next = options.next ?? []
    this.info = options.info
  }
}

/** Minimal slice of the incur run context used to report errors. */
type ErrorContext = {
  error: (options: {
    code: string
    message: string
    exitCode?: number
    retryable?: boolean
    cta?: { commands: NextCommand[] }
  }) => never
}

/**
 * Run a command body and turn a thrown {@link FocError} into an incur error
 * result, keeping its code, exit class, and next steps. Other errors propagate
 * to incur, which reports them as `UNKNOWN`.
 */
export async function guard<T>(c: ErrorContext, fn: () => Promise<T>) {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof FocError) {
      const message = error.info
        ? `${error.shortMessage} ${formatInfo(error.info)}`
        : error.shortMessage
      return c.error({
        code: error.code,
        message,
        exitCode: error.exitCode ?? ExitCode.unexpected,
        retryable: error.retryable,
        ...(error.next.length > 0 ? { cta: { commands: error.next } } : {}),
      })
    }
    throw error
  }
}

/** Render error facts as `key=value` pairs appended to a message. */
function formatInfo(info: Record<string, unknown>): string {
  return Object.entries(info)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ')
}
