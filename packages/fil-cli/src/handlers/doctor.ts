import { defineHandler, isCliError } from 'clipact'
import { getBlockNumber } from 'viem/actions'
import { resolveCredentials } from '../auth/session.ts'
import { doctor } from '../commands/doctor.ts'
import { abortable } from '../errors.ts'
import { firstLine } from '../map-error.ts'
import { stateDir } from '../state/db.ts'
import { appFor } from './context.ts'

/** Milliseconds to wait for the RPC check. */
const RPC_TIMEOUT = 10_000

/**
 * Report resolved settings with their sources, then check that the state
 * database opens and the RPC endpoint answers on the expected chain. Never
 * prints the session key.
 */
export default defineHandler(doctor, async (ctx) => {
  const app = appFor(ctx)
  const env = app.env
  const checks: { name: string; ok: boolean; message: string }[] = []

  let credentials: 'env' | 'config' | 'pending' | 'none' = 'none'
  try {
    credentials = resolveCredentials(app)?.source ?? 'none'
  } catch (error) {
    if (!isCliError(error)) throw error
    credentials = error.code === 'invalid_input' ? 'env' : 'pending'
    checks.push({ name: 'credentials', ok: false, message: error.message })
  }

  try {
    app.db()
    checks.push({
      name: 'state',
      ok: true,
      message: 'Database opened and migrated',
    })
  } catch (error) {
    checks.push({
      name: 'state',
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  try {
    // The app's transport already stops on ctx.signal; this adds a deadline.
    const block = await abortable(
      getBlockNumber(app.client, { cacheTime: 0 }),
      AbortSignal.timeout(RPC_TIMEOUT)
    )
    checks.push({
      name: 'rpc',
      ok: true,
      message: `Chain ${app.chain.id} at block ${block}`,
    })
  } catch (error) {
    if (ctx.signal.aborted) throw error
    checks.push({
      name: 'rpc',
      ok: false,
      message:
        error instanceof DOMException && error.name === 'TimeoutError'
          ? `No answer within ${RPC_TIMEOUT / 1000} s`
          : error instanceof Error
            ? firstLine(error)
            : String(error),
    })
  }

  const rpcUrl = env.FIL_RPC_URL ?? app.chain.rpcUrls.default.http[0] ?? ''
  return ctx.ok({
    network: {
      value: app.network,
      source: ctx.input.network
        ? 'input'
        : app.config.get('network')
          ? 'config'
          : 'default',
    },
    rpcUrl: { value: rpcUrl, source: env.FIL_RPC_URL ? 'env' : 'default' },
    consoleUrl: {
      value: app.consoleUrl,
      source: env.FIL_CONSOLE_URL ? 'env' : 'default',
    },
    apiUrl: {
      value: app.apiUrl,
      source: env.FIL_API_URL ? 'env' : 'default',
    },
    configFile: app.config.path,
    stateDir: {
      value: stateDir(env),
      source: env.FIL_STATE_DIR ? 'env' : 'default',
    },
    credentials,
    checks,
  })
})
