import { isAddress } from 'viem'
import { z } from 'zod'
import { ID_RE } from '@/lib/search'

/** Lowercase 0x address search param. */
export const zAddress = z
  .string()
  .refine((value) => isAddress(value, { strict: false }))
  .transform((value) => value.toLowerCase())
  .optional()
  .catch(undefined)

/** fil-api string boolean search param. */
export const zBool = z.enum(['true', 'false']).optional().catch(undefined)

/** Unsigned integer id search param. */
export const zId = z.string().regex(ID_RE).optional().catch(undefined)
