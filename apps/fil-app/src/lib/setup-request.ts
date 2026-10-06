import {
  AddPiecesPermission,
  CreateDataSetPermission,
  type Permission,
  SchedulePieceRemovalsPermission,
  TerminateServicePermission,
} from '@filoz/synapse-core/session-key'
import { isAddress } from 'viem'
import { z } from 'zod'
import { parseUnitsSafe } from './format.ts'
import { NETWORKS } from './networks.ts'

/**
 * Session-key scope IDs a setup link can request, in display order. They
 * match the IDs `fil login --scopes` takes.
 */
export const SCOPE_IDS = [
  'createDataSet',
  'addPieces',
  'schedulePieceRemovals',
  'terminateService',
] as const

/** A session-key scope ID. */
export type ScopeId = (typeof SCOPE_IDS)[number]

/**
 * FWSS permission typehash for each scope ID.
 *
 * @see https://github.com/FilOzone/synapse-sdk/blob/master/docs/src/content/docs/developer-guides/session-keys.mdx
 */
export const SCOPE_PERMISSIONS = {
  createDataSet: CreateDataSetPermission,
  addPieces: AddPiecesPermission,
  schedulePieceRemovals: SchedulePieceRemovalsPermission,
  terminateService: TerminateServicePermission,
} as const satisfies Record<ScopeId, Permission>

/** Scopes requested when a link names a session key but no scopes. */
export const DEFAULT_SCOPES: ScopeId[] = [
  'createDataSet',
  'addPieces',
  'schedulePieceRemovals',
]

/** Expiry, in days, when a link does not set one. */
export const DEFAULT_DAYS = 30

/** Longest expiry, in days, a link or the form accepts. */
export const MAX_DAYS = 365

/** Longest session-key name (the on-chain `origin`) a link accepts. */
export const MAX_NAME_LENGTH = 64

/** Session-key name when a link does not set one. */
export const DEFAULT_NAME = 'fil'

/**
 * Whether a value is a known scope ID.
 *
 * @param value - Candidate scope ID.
 */
export function isScopeId(value: string): value is ScopeId {
  return (SCOPE_IDS as readonly string[]).includes(value)
}

/**
 * Parse a comma-separated scope list, keeping known IDs in display order.
 *
 * @param value - Link value, e.g. `createDataSet,addPieces`.
 * @returns The scopes, or `undefined` when none are known.
 */
export function parseScopes(value: string): ScopeId[] | undefined {
  const requested = new Set(value.split(',').map((scope) => scope.trim()))
  const scopes = SCOPE_IDS.filter((scope) => requested.has(scope))
  return scopes.length > 0 ? scopes : undefined
}

/**
 * Scopes a setup link requests: its `scopes` value, or {@link DEFAULT_SCOPES}.
 *
 * @param value - Validated `scopes` search param.
 */
export function requestedScopes(value: string | undefined): ScopeId[] {
  return (value ? parseScopes(value) : undefined) ?? DEFAULT_SCOPES
}

/**
 * Whether a value is a whole number of days between 1 and {@link MAX_DAYS}.
 *
 * @param value - Candidate number of days.
 */
export function isValidDays(value: string) {
  return /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= MAX_DAYS
}

/**
 * Search params of `/dashboard/setup`. Each one is optional, and an invalid
 * value is dropped instead of failing the page.
 *
 * - `network`: the network the request is for.
 * - `signer`: the session-key address to authorize (lowercased).
 * - `name`: the session-key name, recorded on chain as its `origin`.
 * - `scopes`: comma-separated {@link SCOPE_IDS}.
 * - `days`: days until the authorization expires.
 * - `deposit`: USDFC to deposit, as a decimal amount.
 */
export const setupSearchSchema = z.object({
  network: z.enum(NETWORKS).optional().catch(undefined),
  signer: z
    .string()
    .refine((value) => isAddress(value, { strict: false }))
    .transform((value) => value.toLowerCase())
    .optional()
    .catch(undefined),
  name: z
    .string()
    .trim()
    .min(1)
    .max(MAX_NAME_LENGTH)
    .optional()
    .catch(undefined),
  scopes: z.string().refine(parseScopes).optional().catch(undefined),
  days: z.string().refine(isValidDays).optional().catch(undefined),
  deposit: z
    .string()
    .refine((value) => (parseUnitsSafe(value) ?? 0n) > 0n)
    .optional()
    .catch(undefined),
})

/** Validated search params of `/dashboard/setup`. */
export type SetupSearch = z.infer<typeof setupSearchSchema>

/** A setup request as an agent or a deep link describes it. */
export interface SetupRequest {
  network?: (typeof NETWORKS)[number]
  signer?: string
  name?: string
  scopes?: readonly string[]
  days?: number
  deposit?: string
}

/** Problems found in a {@link SetupRequest}; empty when it is valid. */
export type SetupRequestErrors = string[]

/**
 * Validate a setup request and turn it into `/dashboard/setup` search params.
 *
 * @param request - Request from an agent tool call.
 * @returns The search params, or the problems that make the request invalid.
 */
export function toSetupSearch(
  request: SetupRequest
): { search: SetupSearch } | { errors: SetupRequestErrors } {
  const errors: SetupRequestErrors = []
  const raw: Record<string, string> = {}
  if (request.network !== undefined) raw.network = request.network
  if (request.signer !== undefined) raw.signer = request.signer
  if (request.name !== undefined) raw.name = request.name
  if (request.scopes !== undefined) raw.scopes = request.scopes.join(',')
  if (request.days !== undefined) raw.days = String(request.days)
  if (request.deposit !== undefined) raw.deposit = request.deposit
  const search = setupSearchSchema.parse(raw)
  const unknown = (request.scopes ?? []).filter((scope) => !isScopeId(scope))
  for (const key of Object.keys(raw) as (keyof SetupSearch)[]) {
    // Unknown scopes get a more specific message below.
    if (search[key] === undefined && !(key === 'scopes' && unknown.length)) {
      errors.push(INVALID[key])
    }
  }
  if (unknown.length > 0) {
    errors.push(
      `Unknown scopes: ${unknown.join(', ')}. Use: ${SCOPE_IDS.join(', ')}.`
    )
  }
  if ((search.name || search.scopes || search.days) && !search.signer) {
    errors.push('name, scopes, and days need a signer.')
  }
  if (errors.length > 0) {
    return { errors }
  }
  return {
    search: Object.fromEntries(
      Object.entries(search).filter(([, value]) => value !== undefined)
    ),
  }
}

/** Error message for each invalid search param. */
const INVALID: Record<keyof SetupSearch, string> = {
  network: `network must be one of: ${NETWORKS.join(', ')}.`,
  signer: 'signer must be a 20-byte hex address.',
  name: `name must be 1 to ${MAX_NAME_LENGTH} characters.`,
  scopes: `scopes must use: ${SCOPE_IDS.join(', ')}.`,
  days: `days must be a whole number from 1 to ${MAX_DAYS}.`,
  deposit: 'deposit must be a positive USDFC amount, e.g. "1.5".',
}

/**
 * Unix time, in seconds, `days` days after `now`.
 *
 * @param days - Days until expiry.
 * @param now - Current time in Unix milliseconds.
 */
export function expiryFromDays(days: number, now = Date.now()) {
  return BigInt(Math.floor(now / 1000) + days * 86_400)
}
