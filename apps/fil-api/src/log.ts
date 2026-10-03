/**
 * Write one JSON log line. Workers Logs indexes JSON fields for querying.
 *
 * @see https://developers.cloudflare.com/workers/observability/logs/workers-logs/
 */
export function log(
  level: 'info' | 'warn' | 'error',
  fields: Record<string, unknown>
) {
  // biome-ignore lint/suspicious/noConsole: structured logs go to Workers Logs
  console[level === 'info' ? 'log' : level](
    JSON.stringify({ level, ...fields })
  )
}
