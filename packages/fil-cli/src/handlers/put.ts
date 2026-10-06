import { defineHandler, isCliError } from 'clipact'
import { PUT_SCOPES } from '../auth/scopes.ts'
import { missingScopes, openSession } from '../auth/session.ts'
import { put } from '../commands/put.ts'
import { ErrorCodes } from '../errors.ts'
import { estimatePut, startPut } from '../storage/jobs.ts'
import { createSynapseBackend } from '../storage/synapse.ts'
import type { StorageBackend } from '../storage/types.ts'
import { formatUsdfc } from '../usdfc.ts'
import { appFor, jobContext } from './context.ts'

/** How ready the session key is to sign a put. */
type Authorization =
  | 'ready'
  | 'login_required'
  | 'login_pending'
  | 'scopes_missing'

/**
 * Store a file as a raw piece, or a directory as a UnixFS CAR, with one copy
 * on one provider. With `--dry-run`, report what would be stored, where, and
 * at what cost, without signing, uploading, or creating anything.
 */
export default defineHandler(put, async (ctx) => {
  const { input } = ctx
  const app = appFor(ctx)
  const options = {
    path: input.path,
    name: input.name,
    providerId: input.provider == null ? undefined : BigInt(input.provider),
  }

  if (ctx.dryRun) {
    let backend: StorageBackend | undefined
    let authorization: Authorization = 'ready'
    let missing: string[] | undefined
    try {
      const sessionKey = openSession(app)
      missing = await missingScopes(sessionKey, PUT_SCOPES)
      if (missing.length > 0) authorization = 'scopes_missing'
      backend = createSynapseBackend(app, sessionKey)
    } catch (error) {
      if (!isCliError(error)) throw error
      if (error.code === ErrorCodes.authRequired)
        authorization = 'login_required'
      else if (error.code === ErrorCodes.loginPending)
        authorization = 'login_pending'
      else throw error
    }
    const estimate = await estimatePut({ ...options, backend })
    const { placement, quote } = estimate
    return ctx.ok({
      dryRun: true,
      estimate: {
        kind: estimate.kind,
        name: estimate.name,
        size: estimate.size,
        files: estimate.files,
        ...(estimate.rootCid ? { rootCid: estimate.rootCid } : {}),
        network: app.network,
        authorization,
        ...(missing?.length ? { missingScopes: missing } : {}),
        ...(placement
          ? {
              provider: {
                id: placement.providerId.toString(),
                serviceURL: placement.serviceURL,
                ...(placement.dataSetId == null
                  ? {}
                  : { dataSetId: placement.dataSetId.toString() }),
              },
            }
          : {}),
        ...(quote
          ? {
              cost: {
                token: 'USDFC' as const,
                ready: quote.ready,
                depositNeeded: formatUsdfc(quote.depositNeeded),
                needsApproval: quote.needsApproval,
                ratePerMonth: formatUsdfc(quote.ratePerMonth),
                lockup: formatUsdfc(quote.lockup),
                ...(quote.ready ? {} : { fundingUrl: quote.fundingUrl }),
              },
            }
          : {}),
        checkedAt: new Date().toISOString(),
      },
    })
  }

  const job = await jobContext(app, PUT_SCOPES, ctx)
  const result = await startPut(job, options)
  return ctx.ok(
    { dryRun: false, ...result, state: 'ready' },
    {
      next: [
        {
          by: 'agent',
          command: `fil get ${result.resource.ref}`,
          description: 'Download and verify the stored content',
        },
        {
          by: 'agent',
          command: `fil inspect ${result.resource.ref} --check`,
          description: 'Check that the piece URL answers',
        },
      ],
    }
  )
})
