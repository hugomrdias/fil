import { randomBytes } from 'node:crypto'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

/**
 * Create a short random identifier with a type prefix, such as `res_…` for
 * resources and `op_…` for operations.
 */
export function createId(prefix: 'res' | 'op'): string {
  const bytes = randomBytes(10)
  let id = ''
  for (const byte of bytes) {
    id += ALPHABET[byte % ALPHABET.length]
  }
  return `${prefix}_${id}`
}
