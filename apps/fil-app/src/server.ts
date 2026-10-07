import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { withMarkdownErrors } from '@/lib/site/markdown-errors'

/**
 * Worker entry: Start's handler, with Markdown answers for requests that
 * accept neither HTML nor any type.
 *
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point
 */
export default createServerEntry({
  fetch: withMarkdownErrors(handler.fetch),
})
