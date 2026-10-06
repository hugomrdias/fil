import { setTimeout as sleep } from 'node:timers/promises'
import { sessionKeyRegistry } from '@filoz/synapse-core/abis'
import type { FilecoinChain } from '@filoz/synapse-core/chains'
import {
  type Expirations,
  getExpirations,
} from '@filoz/synapse-core/session-key'
import {
  type Address,
  type Client,
  getAbiItem,
  isAddressEqual,
  type Transport,
} from 'viem'
import { getBlockNumber, getLogs } from 'viem/actions'
import type { Network } from '../network.ts'
import { formatUsdfc } from '../usdfc.ts'
import { SCOPES, type ScopeId, toPermissions } from './scopes.ts'

/** Read client for the target chain. */
type ChainClient = Client<Transport, FilecoinChain>

/** fil-app page that reviews session-key, approval, and deposit requests. */
const SETUP_PATH = '/dashboard/setup'

/** Options for {@link buildAuthorizeUrl}. */
export type AuthorizeUrlOptions = {
  consoleUrl: string
  /** Session key address to authorize. */
  address: Address
  scopes: readonly ScopeId[]
  network: Network
  /** Session-key name, recorded on chain as the authorization's origin. */
  name?: string | undefined
  /** Days until the authorization expires; fil-app defaults to 30. */
  days?: number | undefined
}

/**
 * Build the fil-app link that asks the wallet owner to authorize a session
 * key. The owner reviews the prefilled request and signs it with their
 * wallet. The address is lowercased so the link never carries an invalid
 * mixed-case checksum.
 *
 * @see ../../../../apps/fil-app/src/lib/setup-request.ts
 */
export function buildAuthorizeUrl(options: AuthorizeUrlOptions): string {
  const url = new URL(SETUP_PATH, options.consoleUrl)
  url.searchParams.set('network', options.network)
  url.searchParams.set('signer', options.address.toLowerCase())
  if (options.name) url.searchParams.set('name', options.name)
  url.searchParams.set('scopes', options.scopes.join(','))
  if (options.days != null) url.searchParams.set('days', String(options.days))
  return url.toString()
}

/** Options for {@link buildFundingUrl}. */
export type FundingUrlOptions = {
  consoleUrl: string
  network: Network
  /** USDFC base units to deposit; omit to open the page without a prefill. */
  deposit?: bigint
}

/**
 * Build the fil-app link that prefills a USDFC deposit. The page also offers
 * the Warm Storage (FWSS) operator approval when the wallet lacks it.
 *
 * @see ../../../../apps/fil-app/src/lib/setup-request.ts
 */
export function buildFundingUrl(options: FundingUrlOptions): string {
  const url = new URL(SETUP_PATH, options.consoleUrl)
  url.searchParams.set('network', options.network)
  if (options.deposit != null && options.deposit > 0n) {
    url.searchParams.set('deposit', formatUsdfc(options.deposit))
  }
  return url.toString()
}

/** Largest block range scanned by one `eth_getLogs` request. */
export const LOG_WINDOW = 2000n

/** Options for {@link findAuthorizer}. */
export type FindAuthorizerOptions = {
  client: ChainClient
  /** Session key address to look for. */
  signer: Address
  /** First block to scan: the block when the key was created. */
  fromBlock: bigint
}

/**
 * Find the wallet that authorized `signer`. `signer` is not an indexed event
 * field, so this scans the registry's `AuthorizationsUpdated` events from
 * `fromBlock` in bounded windows and matches the signer locally. Returns the
 * most recent authorizing identity, or `undefined`.
 */
export async function findAuthorizer(
  options: FindAuthorizerOptions
): Promise<Address | undefined> {
  const { client, signer } = options
  const event = getAbiItem({
    abi: sessionKeyRegistry,
    name: 'AuthorizationsUpdated',
  })
  const latest = await getBlockNumber(client, { cacheTime: 0 })
  let found: Address | undefined
  for (let from = options.fromBlock; from <= latest; from += LOG_WINDOW + 1n) {
    const to = from + LOG_WINDOW > latest ? latest : from + LOG_WINDOW
    const logs = await getLogs(client, {
      address: client.chain.contracts.sessionKeyRegistry.address,
      event,
      fromBlock: from,
      toBlock: to,
      strict: true,
    })
    for (const log of logs) {
      if (isAddressEqual(log.args.signer, signer)) {
        found = log.args.identity
      }
    }
  }
  return found
}

/** Per-scope state of a session key read from the registry. */
export type ScopeGrants = {
  granted: ScopeId[]
  missing: ScopeId[]
  /** Earliest expiry among granted scopes, in Unix seconds. */
  expiresAt?: bigint
}

/**
 * Split requested scopes into live and missing using on-chain expiries.
 * `now` is in Unix seconds.
 */
export function classifyScopes(
  scopes: readonly ScopeId[],
  expirations: Partial<Expirations>,
  now = BigInt(Math.floor(Date.now() / 1000))
): ScopeGrants {
  const granted: ScopeId[] = []
  const missing: ScopeId[] = []
  let expiresAt: bigint | undefined
  for (const scope of scopes) {
    const expiry = expirations[SCOPES[scope]] ?? 0n
    if (expiry > now) {
      granted.push(scope)
      if (expiresAt === undefined || expiry < expiresAt) expiresAt = expiry
    } else {
      missing.push(scope)
    }
  }
  return expiresAt === undefined
    ? { granted, missing }
    : { granted, missing, expiresAt }
}

/** Options for {@link readScopes}. */
export type ReadScopesOptions = {
  client: ChainClient
  root: Address
  signer: Address
  scopes: readonly ScopeId[]
}

/** Read the requested scopes' expiries for a session key. */
export async function readScopes(
  options: ReadScopesOptions
): Promise<ScopeGrants> {
  const expirations = await getExpirations(options.client, {
    address: options.root,
    sessionKeyAddress: options.signer,
    permissions: toPermissions(options.scopes),
  })
  return classifyScopes(options.scopes, expirations)
}

/** Result of one {@link checkAuthorization} pass. */
export type AuthorizationState =
  | { status: 'pending' }
  | ({ status: 'granted' | 'partial' | 'none'; root: Address } & ScopeGrants)

/** Options for {@link checkAuthorization}. */
export type CheckAuthorizationOptions = {
  client: ChainClient
  signer: Address
  scopes: readonly ScopeId[]
  fromBlock: bigint
}

/**
 * Check once whether the owner has acted on a pending session key: find the
 * owner, then read the requested scopes.
 */
export async function checkAuthorization(
  options: CheckAuthorizationOptions
): Promise<AuthorizationState> {
  const root = await findAuthorizer(options)
  if (!root) return { status: 'pending' }
  const grants = await readScopes({ ...options, root })
  const status =
    grants.missing.length === 0
      ? 'granted'
      : grants.granted.length > 0
        ? 'partial'
        : 'none'
  return { status, root, ...grants }
}

/** Options for {@link waitForAuthorization}. */
export type WaitForAuthorizationOptions = CheckAuthorizationOptions & {
  timeoutMs: number
  /** Stops waiting; a client bound to it also cancels the pending check. */
  signal?: AbortSignal
}

/** Milliseconds between authorization checks. */
const POLL_INTERVAL = 3000

/**
 * Poll {@link checkAuthorization} until the owner acts or `timeoutMs`
 * passes. RPC errors are retried. Rejects with the signal's reason when
 * `signal` aborts.
 */
export async function waitForAuthorization(
  options: WaitForAuthorizationOptions
): Promise<AuthorizationState> {
  const started = Date.now()
  for (;;) {
    try {
      const state = await checkAuthorization(options)
      if (state.status !== 'pending') return state
    } catch (error) {
      if (options.signal?.aborted) throw error
    }
    if (Date.now() - started + POLL_INTERVAL > options.timeoutMs) {
      return { status: 'pending' }
    }
    await sleep(POLL_INTERVAL, undefined, { signal: options.signal })
  }
}
