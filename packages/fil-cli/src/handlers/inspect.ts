import { defineHandler } from 'clipact'
import { inspect } from '../commands/inspect.ts'
import { resourceUrls } from '../storage/urls.ts'
import { appFor, findResource } from './context.ts'

/** Milliseconds to wait for the retrieval probe. */
const PROBE_TIMEOUT = 15_000

/**
 * Show a managed resource with its fil-api URLs. With `--check`, send a HEAD
 * request to the piece URL and follow fil-api's redirect to the provider, so
 * the check fails until fil-api's indexer has the piece. The browser URL of
 * a folder always redirects to inbrowser.link, so probing it proves nothing.
 */
export default defineHandler(inspect, async (ctx) => {
  const app = appFor(ctx)
  const resource = findResource(app, ctx.input.ref)
  const urls = resourceUrls(resource, app.apiUrl)
  if (!ctx.input.check) return ctx.ok({ resource, urls })
  const probe = urls.piece
  const response = await fetch(probe, {
    method: 'HEAD',
    signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(PROBE_TIMEOUT)]),
  }).catch((error: unknown) => {
    if (ctx.signal.aborted) throw error
    return undefined
  })
  return ctx.ok({
    resource,
    urls,
    retrieval: {
      url: probe,
      state: response?.ok ? 'ready' : 'unavailable',
      status: response?.status ?? 0,
      checkedAt: new Date().toISOString(),
    },
  })
})
