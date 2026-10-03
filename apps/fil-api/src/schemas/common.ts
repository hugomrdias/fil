import { z } from '@hono/zod-openapi'
import { NETWORK_NAMES } from '../networks.ts'

/** Network path parameter. */
export const NetworkSchema = z.enum(NETWORK_NAMES).openapi({
  description: 'Filecoin network',
  example: 'calibration',
})

/** Path parameters shared by every network route. */
export const NetworkParams = z.object({
  network: NetworkSchema.openapi({
    param: { name: 'network', in: 'path' },
  }),
})

/** EVM address, normalized to lowercase. */
export const Address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Expected a 0x-prefixed 20-byte address')
  .transform((v) => v.toLowerCase())
  .openapi({
    type: 'string',
    example: '0x480c51fe9fc90e01fa742c51300cc29e151a71cd',
  })

/** Address in responses (already lowercase). */
export const AddressOut = z.string().openapi({
  example: '0x480c51fe9fc90e01fa742c51300cc29e151a71cd',
})

/** Unsigned integer encoded as a decimal string (ids, uint256 amounts). */
export const Uint = z.string().openapi({
  description: 'Unsigned integer as a decimal string',
  example: '1',
})

/** Unsigned integer input accepted as a decimal string or number. */
export const UintInput = z.coerce
  .string()
  .regex(/^\d+$/, 'Expected an unsigned integer')
  .openapi({ type: 'string', example: '1' })

/** Boolean query parameter (`true` or `false`). */
export const BooleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .openapi({ type: 'string', enum: ['true', 'false'] })

/** Page size. */
export const Limit = z.coerce
  .number()
  .int()
  .min(1)
  .max(200)
  .default(50)
  .openapi({
    type: 'integer',
    description: 'Page size (1-200)',
    default: 50,
    example: 50,
  })

/** Opaque pagination cursor from a previous `nextCursor`. */
export const Cursor = z.string().min(1).max(512).openapi({
  description: 'Opaque cursor from a previous response `nextCursor`',
})

/** Pagination query parameters. */
export const PageQuery = z.object({
  limit: Limit,
  cursor: Cursor.optional(),
})

/** Wrap an item schema in the paginated response envelope. */
export function pageOf<T extends z.ZodType>(item: T, name: string) {
  return z
    .object({
      data: z.array(item),
      nextCursor: z.string().nullable().openapi({
        description: 'Cursor for the next page, or null on the last page',
      }),
    })
    .openapi(name)
}

/** Wrap an item schema in the single-resource response envelope. */
export function itemOf<T extends z.ZodType>(item: T, name: string) {
  return z.object({ data: item }).openapi(name)
}

/** Error response body. */
export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'not_found' }),
      message: z.string(),
      issues: z.array(z.unknown()).optional(),
    }),
  })
  .openapi('Error')

/** Arbitrary JSON metadata recorded onchain as key/value entries. */
export const Metadata = z
  .record(z.string(), z.unknown())
  .nullable()
  .openapi({ example: { source: 'filecoin-pin' } })

/** Standard error responses for network routes. */
export const errorResponses = {
  400: {
    description: 'Invalid request',
    content: { 'application/json': { schema: ErrorSchema } },
  },
  429: {
    description: 'Rate limited',
    content: { 'application/json': { schema: ErrorSchema } },
  },
  503: {
    description: 'Network not available',
    content: { 'application/json': { schema: ErrorSchema } },
  },
} as const

/** 404 response for single-resource routes. */
export const notFoundResponse = {
  404: {
    description: 'Not found',
    content: { 'application/json': { schema: ErrorSchema } },
  },
} as const
