/**
 * Helpers over the Workers custom spans API. `getActiveSpan()`,
 * `setAttributes()` and `recordException()` shipped in September 2026; the
 * workerd bundled with `@cloudflare/vitest-pool-workers` predates them, so
 * these helpers degrade to no-ops there instead of throwing.
 *
 * @see https://developers.cloudflare.com/workers/observability/traces/custom-spans/
 */
import { tracing } from 'cloudflare:workers'

/** Trace span attribute values; `undefined` values are skipped. */
export type SpanAttributes = Record<
  string,
  string | number | boolean | undefined
>

/** The span active on the async context: the invocation's root span outside custom spans. */
export function activeSpan(): Span | undefined {
  return tracing.getActiveSpan?.()
}

/** Set several attributes, skipping `undefined` values. */
export function setAttributes(
  span: Span | undefined,
  attributes: SpanAttributes
) {
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) span?.setAttribute(key, value)
  }
}

/** Record `error` on `span` and mark the span as failed. */
export function recordError(span: Span | undefined, error: unknown) {
  span?.recordException?.(
    error instanceof Error ? error : { message: String(error) }
  )
  span?.setStatus?.({ code: 'error' })
}

/**
 * Run `fn` in a child span named `name` that ends when `fn` settles.
 *
 * @see https://developers.cloudflare.com/workers/observability/traces/custom-spans/#tracingenterspanname-callback-args
 */
export function withSpan<T>(
  name: string,
  attributes: SpanAttributes,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracing.enterSpan(name, async (span) => {
    setAttributes(span, attributes)
    try {
      return await fn(span)
    } catch (error) {
      recordError(span, error)
      throw error
    }
  })
}
