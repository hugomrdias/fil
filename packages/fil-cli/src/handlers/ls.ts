import { defineHandler } from 'clipact'
import { ls } from '../commands/ls.ts'
import { listResources } from '../state/resources.ts'
import { resourceUrls } from '../storage/urls.ts'
import { accountScope, appFor } from './context.ts'

/** List managed resources, newest first, one page at a time. */
export default defineHandler(ls, (ctx) => {
  const app = appFor(ctx)
  const page = listResources(app.db(), {
    ...accountScope(app),
    limit: ctx.input.limit,
    cursor: ctx.input.cursor,
    all: ctx.input.all,
  })
  return ctx.ok({
    network: app.network,
    resources: page.items.map((resource) => ({
      ref: resource.ref,
      kind: resource.kind,
      name: resource.name,
      size: resource.size,
      status: resource.status,
      url: resourceUrls(resource, app.apiUrl).browser,
      createdAt: resource.createdAt,
    })),
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  })
})
