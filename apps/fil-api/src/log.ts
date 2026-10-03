/** Structured log fields written to Workers Logs. */
export type LogFields = Record<string, unknown>

/**
 * Write one JSON log line. Workers Logs indexes JSON fields for querying.
 *
 * @see https://developers.cloudflare.com/workers/observability/logs/workers-logs/
 */
export function log(level: 'info' | 'warn' | 'error', fields: LogFields) {
  const line = JSON.stringify({ level, ...fields })
  // biome-ignore lint/suspicious/noConsole: structured logs go to Workers Logs
  if (level === 'error') console.error(line)
  // biome-ignore lint/suspicious/noConsole: structured logs go to Workers Logs
  else if (level === 'warn') console.warn(line)
  // biome-ignore lint/suspicious/noConsole: structured logs go to Workers Logs
  else console.log(line)
}
