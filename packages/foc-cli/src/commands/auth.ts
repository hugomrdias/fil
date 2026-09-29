import * as Pay from '@filoz/synapse-core/pay'
import { getExpirations } from '@filoz/synapse-core/session-key'
import * as WarmStorage from '@filoz/synapse-core/warm-storage'
import { type Address, formatUnits, getAddress, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { getBlockNumber } from 'viem/actions'
import type { App } from '../app.ts'
import {
  buildAuthorizeUrl,
  buildFundingUrl,
  checkAuthorization,
  readScopes,
  waitForAuthorization,
} from '../auth/login.ts'
import { openBrowser } from '../auth/open-browser.ts'
import {
  DEFAULT_SCOPES,
  isScopeId,
  SCOPES,
  type ScopeId,
} from '../auth/scopes.ts'
import { resolveCredentials } from '../auth/session.ts'
import type { StoredSession } from '../config.ts'
import { ExitCode, FocError } from '../errors.ts'

/** Parse a comma-separated scope list, rejecting unknown IDs. */
export function parseScopes(value: string | undefined): ScopeId[] {
  if (!value) return DEFAULT_SCOPES
  const scopes = value
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean)
  const unknown = scopes.filter((scope) => !isScopeId(scope))
  if (unknown.length > 0 || scopes.length === 0) {
    throw new FocError(
      'INVALID_INPUT',
      `Unknown scopes: ${unknown.join(', ')}. Valid scopes: ${Object.keys(SCOPES).join(', ')}.`,
      { exitCode: ExitCode.invalidInput }
    )
  }
  return [...new Set(scopes)] as ScopeId[]
}

/** Options for {@link login}. */
export type LoginOptions = {
  scopes: ScopeId[]
  /** Wait for approval; otherwise check once and return. */
  wait: boolean
  /** Open the console in a browser while waiting. */
  open: boolean
  /** Generate a new key even if one is pending or valid. */
  fresh: boolean
  timeoutSeconds: number
  progress?: (message: string) => void
}

/** Result of a completed login. */
export type LoginResult = {
  state: 'ready' | 'partial'
  network: string
  address: string
  rootAddress: string
  granted: ScopeId[]
  missing: ScopeId[]
  expiresAt?: string
}

/** Save an approved session and shape the login result. */
function finishLogin(
  app: App,
  session: StoredSession,
  grants: {
    root: Address
    granted: ScopeId[]
    missing: ScopeId[]
    expiresAt?: bigint
  }
): LoginResult {
  const expiresAt = grants.expiresAt?.toString()
  app.config.set(`sessions.${app.network}`, {
    ...session,
    rootAddress: grants.root,
    ...(expiresAt ? { expiresAt } : {}),
  })
  return {
    state: grants.missing.length === 0 ? 'ready' : 'partial',
    network: app.network,
    address: session.address,
    rootAddress: grants.root,
    granted: grants.granted,
    missing: grants.missing,
    ...(expiresAt
      ? { expiresAt: new Date(Number(expiresAt) * 1000).toISOString() }
      : {}),
  }
}

/**
 * Authorize a session key through the pay.filecoin.cloud console.
 *
 * The key is generated and saved locally before anything is opened, so an
 * interrupted login resumes with the same key. The owner approves it in the
 * browser; the CLI finds the approval on chain, so nothing needs to be
 * copied back.
 *
 * @see https://pay.filecoin.cloud/console/session-keys
 */
export async function login(
  app: App,
  options: LoginOptions
): Promise<LoginResult> {
  if (app.env.FOC_SESSION_KEY) {
    throw new FocError(
      'ENV_CREDENTIALS',
      'FOC_SESSION_KEY is set; unset it to log in interactively.',
      { exitCode: ExitCode.invalidInput }
    )
  }
  const key = `sessions.${app.network}` as const
  let session = app.config.get(key)

  // Reuse a valid session that already has every requested scope.
  if (session?.rootAddress && !options.fresh) {
    const grants = await readScopes({
      client: app.client,
      root: getAddress(session.rootAddress),
      signer: getAddress(session.address),
      scopes: options.scopes,
    })
    if (grants.missing.length === 0) {
      return finishLogin(app, session, {
        root: getAddress(session.rootAddress),
        ...grants,
      })
    }
    session = undefined
  }

  // Resume a pending login for the same scopes, or start a new one.
  const sameScopes =
    session != null &&
    session.scopes.length === options.scopes.length &&
    options.scopes.every((scope) => session?.scopes.includes(scope))
  if (!session || session.rootAddress || options.fresh || !sameScopes) {
    const privateKey = generatePrivateKey()
    const fromBlock = await getBlockNumber(app.client, { cacheTime: 0 })
    session = {
      privateKey,
      address: privateKeyToAccount(privateKey).address,
      scopes: options.scopes,
      fromBlock: fromBlock.toString(),
      createdAt: new Date().toISOString(),
    }
    app.config.set(key, session)
  }

  const pending = session
  const url = buildAuthorizeUrl({
    consoleUrl: app.consoleUrl,
    address: pending.address as Address,
    scopes: options.scopes,
    network: app.network,
  })
  const check = {
    client: app.client,
    signer: getAddress(pending.address),
    scopes: options.scopes,
    fromBlock: BigInt(pending.fromBlock),
  }

  if (!options.wait) {
    const state = await checkAuthorization(check)
    if (state.status === 'pending') throw pendingLogin(url)
    if (state.status === 'none') throw scopesDenied(url)
    return finishLogin(app, pending, state)
  }

  options.progress?.(`Approve the session key in your browser:\n  ${url}`)
  if (options.open) openBrowser(url)
  options.progress?.('Waiting for approval on chain…')
  const state = await waitForAuthorization({
    ...check,
    timeoutMs: options.timeoutSeconds * 1000,
  })
  if (state.status === 'pending') throw pendingLogin(url)
  if (state.status === 'none') throw scopesDenied(url)
  return finishLogin(app, pending, state)
}

/** Error returned while the owner has not approved the key yet. */
function pendingLogin(url: string): FocError {
  return new FocError(
    'LOGIN_PENDING',
    'Waiting for the wallet owner to approve the session key.',
    {
      exitCode: ExitCode.pending,
      info: { url },
      next: [{ command: 'login', description: 'Check again after approving' }],
    }
  )
}

/** Error returned when the owner approved none of the requested scopes. */
function scopesDenied(url: string): FocError {
  return new FocError(
    'SCOPES_DENIED',
    'The session key was authorized without any requested scope.',
    {
      exitCode: ExitCode.actionRequired,
      info: { url },
      next: [{ command: 'login --fresh', description: 'Start a new login' }],
    }
  )
}

/** Forget the saved session key for the current network. */
export function logout(app: App): {
  network: string
  removed: boolean
  address?: string
} {
  const key = `sessions.${app.network}` as const
  const session = app.config.get(key)
  if (session) app.config.delete(key)
  return {
    network: app.network,
    removed: session != null,
    ...(session ? { address: session.address } : {}),
  }
}

/** Format a USDFC base-unit amount. */
function usdfc(value: bigint): string {
  return formatUnits(value, 18)
}

/** Nominal upload size used to check readiness: 1 MiB. */
const PROBE_SIZE = 1n << 20n

/**
 * Report the session, its scope expiries, and whether the payer can upload.
 */
export async function status(app: App) {
  let credentials: ReturnType<typeof resolveCredentials>
  try {
    credentials = resolveCredentials(app)
  } catch (error) {
    if (error instanceof FocError && error.code === 'LOGIN_PENDING') {
      const session = app.config.get(`sessions.${app.network}`)
      return {
        network: app.network,
        session: {
          state: 'pending' as const,
          address: session?.address,
          ...(session
            ? {
                url: buildAuthorizeUrl({
                  consoleUrl: app.consoleUrl,
                  address: session.address as Address,
                  scopes: session.scopes.filter(isScopeId),
                  network: app.network,
                }),
              }
            : {}),
        },
      }
    }
    throw error
  }
  if (!credentials) {
    return { network: app.network, session: { state: 'none' as const } }
  }
  const root = credentials.rootAddress
  const signer = privateKeyToAccount(credentials.privateKey as Hex).address
  const [expirations, summary, costs] = await Promise.all([
    getExpirations(app.client, {
      address: root,
      sessionKeyAddress: signer,
      permissions: Object.values(SCOPES),
    }),
    Pay.getAccountSummary(app.client, { address: root }),
    WarmStorage.getUploadCosts(app.client, {
      clientAddress: root,
      pieceSizes: [PROBE_SIZE],
      isNewDataSet: true,
    }),
  ])
  const now = BigInt(Math.floor(Date.now() / 1000))
  const scopes = Object.fromEntries(
    Object.entries(SCOPES).map(([id, permission]) => {
      const expiry = expirations[permission] ?? 0n
      return [
        id,
        expiry > now
          ? new Date(Number(expiry) * 1000).toISOString()
          : expiry > 0n
            ? 'expired'
            : 'not granted',
      ]
    })
  )
  return {
    network: app.network,
    session: {
      state: 'active' as const,
      source: credentials.source,
      address: signer,
      rootAddress: root,
      scopes,
    },
    account: {
      token: 'USDFC',
      funds: usdfc(summary.funds),
      availableFunds: usdfc(summary.availableFunds),
      debt: usdfc(summary.debt),
      ready: costs.ready,
      needsApproval: costs.needsFwssMaxApproval,
      depositNeeded: usdfc(costs.depositNeeded),
      ...(costs.ready
        ? {}
        : {
            fundingUrl: buildFundingUrl({
              consoleUrl: app.consoleUrl,
              network: app.network,
              deposit: costs.depositNeeded,
            }),
          }),
    },
  }
}
