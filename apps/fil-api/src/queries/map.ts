/** Convert a nullable database scalar to a string. */
export function str(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/** Convert a non-null database scalar to a string. */
export function req(value: unknown): string {
  return String(value ?? '')
}

/** Convert a database numeric to a JS number (for timestamps and blocks). */
export function num(value: unknown): number {
  return Number(value)
}

/** Return a nullable boolean column as-is. */
export function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** Return a jsonb object column, or null. */
export function json(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}
