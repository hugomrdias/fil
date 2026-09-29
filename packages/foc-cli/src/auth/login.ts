import { sessionKeyRegistry } from '@filoz/synapse-core/abis'
import type { FilecoinChain } from '@filoz/synapse-core/chains'
import {
  type Expirations,
  getExpirations,
} from '@filoz/synapse-core/session-key'
import {
  type Address,
  type Client,
  formatUnits,
  getAbiItem,
  isAddressEqual,
  type Transport,
} from 'viem'
import { getBlockNumber, getLogs } from 'viem/actions'
import type { Network } from '../config.ts'
import { SCOPES, type ScopeId } from './scopes.ts'

/** Read client for the target chain. */
type ChainClient = Client<Transport, FilecoinChain>

/** Options for {@link buildAuthorizeUrl}. */
export type AuthorizeUrlOptions = {
  consoleUrl: string
  /** Session key address to authorize. */
  address: Address
  scopes: readonly ScopeId[]
  network: Network
}

/**
 * Build the console link that asks the wallet owner to authorize a session
 * key. The address is lowercased because the console rejects addresses with
 * an invalid mixed-case checksum and accepts all-lowercase input.
 */
export function buildAuthorizeUrl(options: AuthorizeUrlOptions): string {
  const url = new URL('/console/session-keys', options.consoleUrl)
  url.searchParams.set('authorize', options.address.toLowerCase())
  url.searchParams.set('scopes', options.scopes.join(','))
  url.searchParams.set('network', options.network)
  return url.toString()
}

/** Options for {@link buildFundingUrl}. */
export type FundingUrlOptions = {
  consoleUrl: string
  network: Network
  /** USDFC base units to deposit; omit to open the console without a prefill. */
  deposit?: bigint
}

/**
 * Build the console link that prefills a USDFC deposit and FWSS operator
 * approval. The console requires `deposit`, `operator`, and `network`
 * together, with a positive decimal amount.
 */
export function buildFundingUrl(options: FundingUrlOptions): string {
  const url = new URL('/console', options.consoleUrl)
  if (options.deposit != null && options.deposit > 0n) {
    url.searchParams.set('deposit', formatUnits(options.deposit, 18))
    url.searchParams.set('operator', 'fwss')
    url.searchParams.set('network', options.network)
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
    permissions: options.scopes.map((scope) => SCOPES[scope]),
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
  /** Known owner, which skips the event scan. */
  root?: Address
}

/**
 * Check once whether the owner has acted on a pending session key: find the
 * owner (unless known), then read the requested scopes.
 */
export async function checkAuthorization(
  options: CheckAuthorizationOptions
): Promise<AuthorizationState> {
  const root = options.root ?? (await findAuthorizer(options))
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
  intervalMs?: number
  /** Called after each pass that is still pending or failed transiently. */
  onTick?: (info: { elapsedMs: number; error?: unknown }) => void
}

/**
 * Poll {@link checkAuthorization} until the owner acts or `timeoutMs`
 * passes. RPC errors are reported through `onTick` and retried.
 */
export async function waitForAuthorization(
  options: WaitForAuthorizationOptions
): Promise<AuthorizationState> {
  const started = Date.now()
  const interval = options.intervalMs ?? 3000
  for (;;) {
    try {
      const state = await checkAuthorization(options)
      if (state.status !== 'pending' && state.status !== 'none') return state
      // With a known owner and no live scopes the owner has not acted yet.
      if (state.status === 'none' && !options.root) return state
      options.onTick?.({ elapsedMs: Date.now() - started })
    } catch (error) {
      options.onTick?.({ elapsedMs: Date.now() - started, error })
    }
    if (Date.now() - started + interval > options.timeoutMs) {
      return { status: 'pending' }
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}
