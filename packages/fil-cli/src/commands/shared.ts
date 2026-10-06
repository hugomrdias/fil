import * as z from 'zod'
import { NETWORKS } from '../network.ts'

/**
 * Input every command that talks to the chain accepts. clipact has no global
 * options, so each command spreads this into its input schema.
 *
 * @see ../../../../docs/agent-cli/framework-design.md#defining-commands
 */
export const account = {
  network: z
    .enum(NETWORKS)
    .optional()
    .describe(
      'Network (default: FIL_NETWORK, then the config file, then calibration)'
    ),
  sessionKey: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'Expected a 32-byte hex private key')
    .optional()
    .describe('Session key for CI, instead of the one saved by fil login'),
  rootAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'Expected a 20-byte hex address')
    .optional()
    .describe('Wallet that authorized FIL_SESSION_KEY'),
}

/** Environment variables for {@link account}; `sessionKey` is a secret. */
export const accountEnv = {
  network: 'FIL_NETWORK',
  sessionKey: 'FIL_SESSION_KEY',
  rootAddress: 'FIL_ROOT_ADDRESS',
} as const

/** Page size and cursor of list commands. */
export const paging = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Maximum results per page'),
  cursor: z.string().optional().describe('nextCursor of the previous page'),
}

/** One on-chain storage occurrence of a resource. IDs are decimal strings. */
export const copy = z.object({
  providerId: z.string(),
  dataSetId: z.string(),
  pieceId: z.string(),
  serviceURL: z.string(),
})

/** A file or artifact managed by `fil`. */
export const resource = z.object({
  ref: z.string(),
  kind: z.enum(['file', 'artifact']),
  name: z.string(),
  chainId: z.string(),
  payer: z.string(),
  pieceCid: z.string(),
  rootCid: z.string().optional(),
  size: z.number().int().describe('Stored bytes'),
  copies: z.array(copy),
  url: z.string().optional(),
  status: z.enum(['active', 'removal_pending']),
  createdAt: z.string(),
})

/** fil-api retrieval URLs, which redirect to a provider or a gateway. */
export const urls = z.object({
  piece: z.string().describe('Exact stored bytes'),
  browser: z
    .string()
    .describe('Link a browser renders: a folder through inbrowser.link'),
})

/** Result of a put, a delete, or a resumed operation. */
export const jobResult = {
  operationId: z.string(),
  state: z.enum(['ready', 'removal_pending']),
  resource,
  urls,
}

/** Execution state of an operation. */
export const executionStatus = z.enum([
  'pending',
  'running',
  'failed',
  'completed',
])

/** One line of an operation list. */
export const operationSummary = z.object({
  id: z.string(),
  action: z.enum(['put', 'delete']),
  resourceRef: z.string(),
  phase: z.string(),
  executionStatus,
  updatedAt: z.string(),
  error: z.string().optional(),
})

/** Formats a byte count for humans. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`
}
