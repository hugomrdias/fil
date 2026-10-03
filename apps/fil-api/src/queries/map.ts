/**
 * Lowercase a nullable address column. Some indexer tables store checksummed
 * addresses; responses always use lowercase.
 */
export function addr(value: string | null): string | null {
  return value?.toLowerCase() ?? null
}

/** Lowercase an address column, using `''` for null (see {@link addr}). */
export function reqAddr(value: string | null): string {
  return (value ?? '').toLowerCase()
}
