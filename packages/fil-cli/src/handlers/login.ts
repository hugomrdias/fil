import { CliError, defineHandler } from 'clipact'
import { type Address, getAddress } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { getBlockNumber } from 'viem/actions'
import type { App } from '../app.ts'
import {
  buildAuthorizeUrl,
  checkAuthorization,
  readScopes,
  type ScopeGrants,
  waitForAuthorization,
} from '../auth/login.ts'
import { openBrowser } from '../auth/open-browser.ts'
import { DEFAULT_KEY_NAME } from '../auth/scope-ids.ts'
import { DEFAULT_SCOPES, isScopeId, type ScopeId } from '../auth/scopes.ts'
import { loginCommand, loginPending, notLoggedIn } from '../auth/session.ts'
import { login } from '../commands/login.ts'
import type { StoredSession } from '../config.ts'
import { ErrorCodes, invalidInput } from '../errors.ts'
import { appFor } from './context.ts'

/** Result of a completed login. */
type LoginResult = {
  network: string
  address: string
  rootAddress: string
  scopes: ScopeId[]
  expiresAt?: string
}

/** Known scopes of a saved session; the defaults if it lists none. */
function savedScopes(session: StoredSession): ScopeId[] {
  const scopes = session.scopes.filter(isScopeId)
  return scopes.length > 0 ? scopes : DEFAULT_SCOPES
}

/** The approval link of a saved session. */
function authorizeUrl(app: App, session: StoredSession): string {
  return buildAuthorizeUrl({
    consoleUrl: app.consoleUrl,
    address: session.address as Address,
    scopes: savedScopes(session),
    network: app.network,
    name: session.name,
    days: session.days,
  })
}

/** Save the owner and expiry of an approved session and return it. */
function saveApproval(
  app: App,
  session: StoredSession,
  grants: ScopeGrants & { root: Address }
): StoredSession {
  const expiresAt = grants.expiresAt?.toString()
  const approved: StoredSession = {
    ...session,
    rootAddress: grants.root,
    ...(expiresAt ? { expiresAt } : {}),
  }
  app.config.set(`sessions.${app.network}`, approved)
  return approved
}

/**
 * Save an approved session. Returns the result when every requested scope
 * was granted; throws `permission_denied` with the missing scopes when some
 * were not.
 */
function finishLogin(
  app: App,
  session: StoredSession,
  grants: ScopeGrants & { root: Address }
): LoginResult {
  saveApproval(app, session, grants)
  if (grants.missing.length > 0) {
    throw new CliError({
      code: ErrorCodes.permissionDenied,
      message: `The wallet owner did not grant: ${grants.missing.join(', ')}.`,
      details: { missing: grants.missing },
      next: [
        {
          by: 'user',
          command: 'fil login --fresh',
          description: 'Start a new login and approve every requested scope',
        },
      ],
    })
  }
  return {
    network: app.network,
    address: session.address,
    rootAddress: grants.root,
    scopes: grants.granted,
    ...(grants.expiresAt
      ? { expiresAt: new Date(Number(grants.expiresAt) * 1000).toISOString() }
      : {}),
  }
}

/**
 * Error returned when `--scopes` asks for more than a saved key that is
 * pending or still valid. Replacing it would discard an approval the owner
 * may have signed, so that takes `--fresh`.
 */
function sessionConflict(
  app: App,
  session: StoredSession,
  requested: readonly ScopeId[]
): CliError {
  const scopes = savedScopes(session)
  const state = session.rootAddress ? 'approved' : 'pending'
  const url = state === 'pending' ? authorizeUrl(app, session) : undefined
  return new CliError({
    code: ErrorCodes.sessionConflict,
    message: `A ${state} session key for ${scopes.join(', ')} is saved for ${app.network}. Replacing it takes --fresh.`,
    details: {
      address: session.address,
      state,
      scopes,
      ...(url ? { url } : {}),
    },
    next: [
      ...(url
        ? [
            {
              by: 'user' as const,
              description: `Open ${url} and approve the saved key with your wallet`,
            },
          ]
        : []),
      {
        by: 'agent',
        command: 'fil login --check',
        description: 'Keep the saved key and its scopes',
      },
      {
        by: 'user',
        command: loginCommand({ fresh: true, scopes: requested }),
        description:
          'Replace the saved key; the wallet owner approves the new one',
      },
    ],
  })
}

/** Error returned by `--check` when the saved key has expired. */
function sessionExpired(scopes: readonly ScopeId[]): CliError {
  return new CliError({
    code: ErrorCodes.sessionExpired,
    message: `The saved session key expired for: ${scopes.join(', ')}.`,
    details: { missing: scopes },
    next: [
      {
        by: 'user',
        command: 'fil login',
        description: 'Authorize a new session key with the same scopes',
      },
    ],
  })
}

/**
 * Authorize a session key through the fil-app dashboard.
 *
 * The key is generated and saved locally before anything is opened, so an
 * interrupted login resumes with the same key. Only its address leaves this
 * machine: the owner reviews a prefilled setup page and signs the approval
 * with their wallet. The CLI finds the approval on chain, so nothing is
 * copied back. Agents and pipes never wait or open a browser: they get the
 * approval link as a `login_pending` error and run `fil login --check` to
 * confirm.
 *
 * Flags left out keep the saved key's scopes, name, and expiry, so running
 * `fil login` again never changes the request. A new key replaces the saved
 * one only with `--fresh`, or when the saved key has expired.
 *
 * @see ../../../../apps/fil-app/src/routes/dashboard/setup.tsx
 */
export default defineHandler(login, async (ctx) => {
  const { input } = ctx
  if (input.sessionKey) {
    throw invalidInput(
      'FIL_SESSION_KEY is set; unset it to log in with fil-app.',
      'sessionKey'
    )
  }
  if (input.check) {
    for (const field of ['scopes', 'name', 'days', 'fresh'] as const) {
      if (input[field] !== undefined && input[field] !== false) {
        throw invalidInput(
          `--check confirms the saved key as it is; drop --${field}.`,
          field
        )
      }
    }
  }
  const app = appFor(ctx)
  const human = ctx.mode.interactive && ctx.mode.agent === false
  const wait = input.wait ?? human
  const key = `sessions.${app.network}` as const
  const saved = app.config.get(key)
  const scopes = input.scopes ?? (saved ? savedScopes(saved) : DEFAULT_SCOPES)
  let session: StoredSession | undefined

  if (saved && !input.fresh) {
    let current = saved
    const covered =
      input.scopes == null ||
      input.scopes.every((scope) => savedScopes(saved).includes(scope))

    // Resume a pending login that covers the request. Before replacing one
    // that doesn't, check whether the owner approved it in the meantime.
    if (!current.rootAddress) {
      if (covered) {
        session = current
      } else {
        const state = await checkAuthorization({
          client: app.client,
          signer: getAddress(current.address),
          scopes: savedScopes(current),
          fromBlock: BigInt(current.fromBlock),
        })
        if (state.status === 'pending') {
          throw sessionConflict(app, current, scopes)
        }
        current = saveApproval(app, current, state)
      }
    }

    // Reuse an approved key that has the requested scopes. A key the owner
    // approved with fewer scopes is permission_denied. Only an expired key,
    // with every scope gone, is replaced without --fresh.
    if (current.rootAddress) {
      const root = getAddress(current.rootAddress)
      const signer = getAddress(current.address)
      const grants = await readScopes({
        client: app.client,
        root,
        signer,
        scopes,
      })
      if (
        grants.missing.length === 0 ||
        (input.scopes == null && grants.granted.length > 0)
      ) {
        return ctx.ok(finishLogin(app, current, { root, ...grants }))
      }
      if (input.scopes != null) {
        const held = await readScopes({
          client: app.client,
          root,
          signer,
          scopes: savedScopes(current),
        })
        if (held.granted.length > 0) {
          throw sessionConflict(app, current, scopes)
        }
      }
      if (input.check) throw sessionExpired(scopes)
    }
  }

  if (!session) {
    if (input.check) throw notLoggedIn()
    const privateKey = generatePrivateKey()
    const fromBlock = await getBlockNumber(app.client, { cacheTime: 0 })
    session = {
      privateKey,
      address: privateKeyToAccount(privateKey).address,
      scopes,
      ...(saved?.name ? { name: saved.name } : {}),
      ...(saved?.days == null ? {} : { days: saved.days }),
      fromBlock: fromBlock.toString(),
      createdAt: new Date().toISOString(),
    }
  }

  // Flags given now change the name and expiry; the rest stay as saved.
  const pending: StoredSession = {
    ...session,
    name: input.name ?? session.name ?? DEFAULT_KEY_NAME,
    ...(input.days == null ? {} : { days: input.days }),
  }
  app.config.set(key, pending)
  const url = authorizeUrl(app, pending)
  const check = {
    client: app.client,
    signer: getAddress(pending.address),
    scopes: savedScopes(pending),
    fromBlock: BigInt(pending.fromBlock),
  }

  if (!wait) {
    const state = await checkAuthorization(check)
    if (state.status === 'pending') throw loginPending(url)
    return ctx.ok(finishLogin(app, pending, state))
  }

  ctx.log(`Approve the session key in your browser:\n  ${url}`)
  if (input.open && human) openBrowser(url)
  ctx.progress({ phase: 'login', message: 'Waiting for approval on chain' })
  const state = await waitForAuthorization({
    ...check,
    timeoutMs: input.timeout * 1000,
    signal: ctx.signal,
  })
  if (state.status === 'pending') throw loginPending(url)
  return ctx.ok(finishLogin(app, pending, state))
})
