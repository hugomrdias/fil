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
import { DEFAULT_SCOPES, type ScopeId } from '../auth/scopes.ts'
import { loginPending } from '../auth/session.ts'
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

/**
 * Save an approved session. Returns the result when every requested scope
 * was granted; throws `permission_denied` (with the partial result) when
 * some were not.
 */
function finishLogin(
  app: App,
  session: StoredSession,
  grants: ScopeGrants & { root: Address }
): LoginResult {
  const expiresAt = grants.expiresAt?.toString()
  app.config.set(`sessions.${app.network}`, {
    ...session,
    rootAddress: grants.root,
    ...(expiresAt ? { expiresAt } : {}),
  })
  const result: LoginResult = {
    network: app.network,
    address: session.address,
    rootAddress: grants.root,
    scopes: grants.granted,
    ...(expiresAt
      ? { expiresAt: new Date(Number(expiresAt) * 1000).toISOString() }
      : {}),
  }
  if (grants.missing.length > 0) {
    throw new CliError({
      code: ErrorCodes.permissionDenied,
      message: `The wallet owner did not grant: ${grants.missing.join(', ')}.`,
      details: { missing: grants.missing },
      data: result,
      next: [
        {
          by: 'user',
          command: 'fil login --fresh',
          description: 'Start a new login and approve every requested scope',
        },
      ],
    })
  }
  return result
}

/**
 * Authorize a session key through the pay.filecoin.cloud console.
 *
 * The key is generated and saved locally before anything is opened, so an
 * interrupted login resumes with the same key. The owner approves it in the
 * browser; the CLI finds the approval on chain, so nothing is copied back.
 * Agents and pipes never wait or open a browser: they get the approval link
 * as a `login_pending` error and run `fil login` again to check.
 *
 * @see https://pay.filecoin.cloud/console/session-keys
 */
export default defineHandler(login, async (ctx) => {
  const { input } = ctx
  if (input.sessionKey) {
    throw invalidInput(
      'FIL_SESSION_KEY is set; unset it to log in with the console.',
      'sessionKey'
    )
  }
  const app = appFor(ctx)
  const scopes = input.scopes ?? DEFAULT_SCOPES
  const human = ctx.mode.interactive && ctx.mode.agent === false
  const wait = input.wait ?? human
  const key = `sessions.${app.network}` as const
  let session = app.config.get(key)

  // Reuse a valid session that already has every requested scope.
  if (session?.rootAddress && !input.fresh) {
    const grants = await readScopes({
      client: app.client,
      root: getAddress(session.rootAddress),
      signer: getAddress(session.address),
      scopes,
    })
    if (grants.missing.length === 0) {
      return ctx.ok(
        finishLogin(app, session, {
          root: getAddress(session.rootAddress),
          ...grants,
        })
      )
    }
    session = undefined
  }

  // Resume a pending login for the same scopes, or start a new one.
  const sameScopes =
    session != null &&
    session.scopes.length === scopes.length &&
    scopes.every((scope) => session?.scopes.includes(scope))
  if (!session || session.rootAddress || input.fresh || !sameScopes) {
    const privateKey = generatePrivateKey()
    const fromBlock = await getBlockNumber(app.client, { cacheTime: 0 })
    session = {
      privateKey,
      address: privateKeyToAccount(privateKey).address,
      scopes,
      fromBlock: fromBlock.toString(),
      createdAt: new Date().toISOString(),
    }
    app.config.set(key, session)
  }

  const pending = session
  const url = buildAuthorizeUrl({
    consoleUrl: app.consoleUrl,
    address: pending.address as Address,
    scopes,
    network: app.network,
  })
  const check = {
    client: app.client,
    signer: getAddress(pending.address),
    scopes,
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
