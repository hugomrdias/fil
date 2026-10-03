import { fromSecp256k1 } from '@filoz/synapse-core/session-key'
import { CliError } from 'clipact'
import { type Address, getAddress, type Hex, isAddress } from 'viem'
import type { App } from '../app.ts'
import { ErrorCodes, invalidInput } from '../errors.ts'
import { buildAuthorizeUrl } from './login.ts'
import { isScopeId, SCOPES, type ScopeId, toPermissions } from './scopes.ts'

/** A session key ready to sign, bound to its root wallet. */
export type SessionKey = ReturnType<typeof fromSecp256k1>

/** Credentials resolved from command input or the config file. */
export type SessionCredentials = {
  privateKey: Hex
  rootAddress: Address
  source: 'env' | 'config'
}

/**
 * Resolve credentials: `FIL_SESSION_KEY` with `FIL_ROOT_ADDRESS` (command
 * input), then the session saved by `fil login` for the network. Returns
 * `undefined` when neither is available; throws `login_pending` when a login
 * still waits for approval.
 */
export function resolveCredentials(app: App): SessionCredentials | undefined {
  const { sessionKey, rootAddress } = app.credentials
  if (sessionKey || rootAddress) {
    // The input schema checks both formats; this checks they come together
    // and that a mixed-case address has a valid checksum.
    if (!sessionKey) {
      throw invalidInput(
        'FIL_SESSION_KEY must be a 32-byte hex private key.',
        'sessionKey'
      )
    }
    if (!(rootAddress && isAddress(rootAddress))) {
      throw invalidInput(
        'FIL_ROOT_ADDRESS must be the wallet that authorized FIL_SESSION_KEY.',
        'rootAddress'
      )
    }
    return {
      privateKey: sessionKey as Hex,
      rootAddress: getAddress(rootAddress),
      source: 'env',
    }
  }
  const session = app.config.get(`sessions.${app.network}`)
  if (!session) return undefined
  if (!session.rootAddress) {
    throw loginPending(
      buildAuthorizeUrl({
        consoleUrl: app.consoleUrl,
        address: session.address as Address,
        scopes: session.scopes.filter(isScopeId),
        network: app.network,
      })
    )
  }
  return {
    privateKey: session.privateKey as Hex,
    rootAddress: getAddress(session.rootAddress),
    source: 'config',
  }
}

/** Error returned while the wallet owner has not approved the session key. */
export function loginPending(url: string): CliError {
  return new CliError({
    code: ErrorCodes.loginPending,
    message: 'The session key is waiting for approval in the console.',
    details: { url },
    next: [
      {
        by: 'user',
        description: `Open ${url} and approve the session key with your wallet`,
      },
      {
        by: 'agent',
        command: 'fil login',
        description: 'Check again after the user approves',
      },
    ],
  })
}

/** Error returned when no credentials are available. */
export function notLoggedIn(): CliError {
  return new CliError({
    code: ErrorCodes.authRequired,
    message: 'No session key for this network.',
    next: [
      {
        by: 'user',
        command: 'fil login',
        description:
          'Authorize a session key in the pay.filecoin.cloud console, then retry',
      },
    ],
  })
}

/** Build the signing session key from resolved credentials. */
export function openSession(app: App): SessionKey {
  const credentials = resolveCredentials(app)
  if (!credentials) throw notLoggedIn()
  return fromSecp256k1({
    privateKey: credentials.privateKey,
    root: credentials.rootAddress,
    chain: app.chain,
    transport: app.transport as Parameters<
      typeof fromSecp256k1
    >[0]['transport'],
  })
}

/** Read the session key's expiries on chain and list scopes it lacks. */
export async function missingScopes(
  sessionKey: SessionKey,
  scopes: readonly ScopeId[]
): Promise<ScopeId[]> {
  const permissions = toPermissions(scopes)
  await sessionKey.syncExpirations(permissions)
  return scopes.filter((scope) => !sessionKey.hasPermission(SCOPES[scope]))
}

/**
 * Build a session key and check on-chain that it holds `scopes`. The SDK's
 * signing helpers do not check permissions, so this runs before every
 * mutation.
 *
 * @see https://github.com/FilOzone/synapse-sdk/blob/master/docs/src/content/docs/developer-guides/session-keys.mdx
 */
export async function requireSession(
  app: App,
  scopes: readonly ScopeId[]
): Promise<SessionKey> {
  const sessionKey = openSession(app)
  const missing = await missingScopes(sessionKey, scopes)
  if (missing.length > 0) {
    throw new CliError({
      code: ErrorCodes.sessionExpired,
      message: `The session key is missing or expired for: ${missing.join(', ')}.`,
      details: { missing },
      next: [
        {
          by: 'user',
          command: 'fil login --fresh',
          description: 'Authorize a new session key with the needed scopes',
        },
      ],
    })
  }
  return sessionKey
}
