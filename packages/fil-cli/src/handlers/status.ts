import * as Pay from '@filoz/synapse-core/pay'
import { getExpirations } from '@filoz/synapse-core/session-key'
import * as WarmStorage from '@filoz/synapse-core/warm-storage'
import { defineHandler, isCliError } from 'clipact'
import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { buildFundingUrl } from '../auth/login.ts'
import { SCOPES } from '../auth/scopes.ts'
import { resolveCredentials } from '../auth/session.ts'
import { status } from '../commands/status.ts'
import { ErrorCodes } from '../errors.ts'
import { formatUsdfc } from '../usdfc.ts'
import { appFor } from './context.ts'

/** Nominal upload size used to check readiness: 1 MiB. */
const PROBE_SIZE = 1n << 20n

/**
 * Report the session, its scope expiries, and whether the payer can upload.
 * A missing or pending session is a state to report, not an error.
 */
export default defineHandler(status, async (ctx) => {
  const app = appFor(ctx)
  let credentials: ReturnType<typeof resolveCredentials>
  try {
    credentials = resolveCredentials(app)
  } catch (error) {
    if (isCliError(error) && error.code === ErrorCodes.loginPending) {
      const session = app.config.get(`sessions.${app.network}`)
      const { url } = error.details as { url: string }
      return ctx.ok({
        network: app.network,
        session: {
          state: 'pending',
          ...(session ? { address: session.address } : {}),
          url,
        },
      })
    }
    throw error
  }
  if (!credentials) {
    return ctx.ok({ network: app.network, session: { state: 'none' } })
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
  return ctx.ok({
    network: app.network,
    session: {
      state: 'active',
      source: credentials.source,
      address: signer,
      rootAddress: root,
      scopes,
    },
    account: {
      token: 'USDFC',
      funds: formatUsdfc(summary.funds),
      availableFunds: formatUsdfc(summary.availableFunds),
      debt: formatUsdfc(summary.debt),
      ready: costs.ready,
      needsApproval: costs.needsFwssMaxApproval,
      depositNeeded: formatUsdfc(costs.depositNeeded),
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
  })
})
