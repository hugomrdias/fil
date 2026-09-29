import { fromSecp256k1, PermissionNames } from '@filoz/synapse-core/session-key'
import { type Address, getAddress, type Hex, isAddress, isHex } from 'viem'
import type { App } from '../app.ts'
import { ExitCode, FocError } from '../errors.ts'
import { type ScopeId, toPermissions } from './scopes.ts'

/** A session key ready to sign, bound to its root wallet. */
export type SessionKey = ReturnType<typeof fromSecp256k1>

/** Credentials resolved from the environment or the config file. */
export type SessionCredentials = {
  privateKey: Hex
  rootAddress: Address
  source: 'env' | 'config'
}

/**
 * Resolve credentials: `FOC_SESSION_KEY` with `FOC_ROOT_ADDRESS`, then the
 * session saved by `foc login` for the current network. Returns `undefined`
 * when neither is available; throws when a login is still pending.
 */
export function resolveCredentials(app: App): SessionCredentials | undefined {
  const envKey = app.env.FOC_SESSION_KEY
  const envRoot = app.env.FOC_ROOT_ADDRESS
  if (envKey || envRoot) {
    if (!(envKey && isHex(envKey) && envKey.length === 66)) {
      throw new FocError(
        'INVALID_CREDENTIALS',
        'FOC_SESSION_KEY must be a 32-byte hex private key.',
        { exitCode: ExitCode.invalidInput }
      )
    }
    if (!(envRoot && isAddress(envRoot))) {
      throw new FocError(
        'INVALID_CREDENTIALS',
        'FOC_ROOT_ADDRESS must be set to the wallet that authorized FOC_SESSION_KEY.',
        { exitCode: ExitCode.invalidInput }
      )
    }
    return {
      privateKey: envKey,
      rootAddress: getAddress(envRoot),
      source: 'env',
    }
  }
  const session = app.config.get(`sessions.${app.network}`)
  if (!session) return undefined
  if (!session.rootAddress) {
    throw new FocError(
      'LOGIN_PENDING',
      'The session key is waiting for approval in the console.',
      {
        exitCode: ExitCode.actionRequired,
        next: [{ command: 'login', description: 'Finish logging in' }],
      }
    )
  }
  return {
    privateKey: session.privateKey as Hex,
    rootAddress: getAddress(session.rootAddress),
    source: 'config',
  }
}

/** Error returned when no credentials are available. */
export function notLoggedIn(): FocError {
  return new FocError('NOT_LOGGED_IN', 'No session key for this network.', {
    exitCode: ExitCode.actionRequired,
    next: [{ command: 'login', description: 'Authorize a session key' }],
  })
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
  const credentials = resolveCredentials(app)
  if (!credentials) throw notLoggedIn()
  const sessionKey = fromSecp256k1({
    privateKey: credentials.privateKey,
    root: credentials.rootAddress,
    chain: app.chain,
    transport: app.transport as Parameters<
      typeof fromSecp256k1
    >[0]['transport'],
  })
  const permissions = toPermissions(scopes)
  await sessionKey.syncExpirations(permissions)
  if (!sessionKey.hasPermissions(permissions)) {
    const missing = permissions
      .filter((permission) => !sessionKey.hasPermission(permission))
      .map((permission) => PermissionNames[permission] ?? permission)
    throw new FocError(
      'SESSION_EXPIRED',
      `The session key is missing or expired for: ${missing.join(', ')}.`,
      {
        exitCode: ExitCode.actionRequired,
        next: [
          { command: 'login', description: 'Authorize a new session key' },
        ],
      }
    )
  }
  return sessionKey
}

/**
 * Resolve the payer address for read-only commands without building a
 * signer. Returns `undefined` when not logged in.
 */
export function currentPayer(app: App): Address | undefined {
  try {
    return resolveCredentials(app)?.rootAddress
  } catch {
    return undefined
  }
}
