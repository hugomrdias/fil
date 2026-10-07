import { markdownPath } from './discovery.ts'
import { MARKDOWN_TYPE } from './negotiate.ts'
import { findSitePage } from './pages.ts'

/** A Worker-style fetch handler. */
type FetchHandler<Args extends unknown[]> = (
  request: Request,
  ...args: Args
) => Response | Promise<Response>

/**
 * Markdown for a path that no page serves.
 *
 * @param origin - Site origin.
 * @param pathname - Requested path.
 */
export function notFoundMarkdown(origin: string, pathname: string) {
  return [
    '# Not found',
    '',
    `fil-app has no page at \`${pathname}\`.`,
    '',
    `- [llms.txt](${origin}/llms.txt) lists the docs, each with a Markdown version.`,
    `- [Sitemap](${origin}/sitemap.xml) lists every page.`,
    '',
  ].join('\n')
}

/**
 * Markdown for a page that exists, but not in a type the request accepts.
 * A docs page points to its Markdown version.
 *
 * @param origin - Site origin.
 * @param pathname - Requested path.
 */
export function htmlOnlyMarkdown(origin: string, pathname: string) {
  const page = findSitePage(pathname)?.page
  const alternative = page
    ? `Its Markdown version is at [${markdownPath(page.path)}](${origin}${markdownPath(page.path)}).`
    : `[llms.txt](${origin}/llms.txt) lists the pages that have a Markdown version, and the REST API that serves the explorer's data.`
  return [
    '# Not acceptable',
    '',
    `fil-app serves \`${pathname}\` as HTML. Request it with \`Accept: text/html\`.`,
    '',
    alternative,
    '',
  ].join('\n')
}

/**
 * Wrap the TanStack Start handler so a request that accepts neither HTML nor
 * any type gets a Markdown answer instead of Start's JSON 406. The wrapper
 * renders the page as HTML to learn whether it exists, then responds with:
 *
 * - `404` and a Markdown pointer to `llms.txt` when no page matches.
 * - `406` and a Markdown note when the page exists only as HTML.
 * - the HTML response itself for redirects and errors.
 *
 * Other responses, including Markdown pages and server routes, pass through.
 *
 * @param handler - Start's fetch handler.
 * @see https://www.rfc-editor.org/rfc/rfc9110#name-406-not-acceptable
 */
export function withMarkdownErrors<Args extends unknown[]>(
  handler: FetchHandler<Args>
): FetchHandler<Args> {
  return async (request, ...args) => {
    const response = await handler(request, ...args)
    if (
      response.status !== 406 ||
      (request.method !== 'GET' && request.method !== 'HEAD')
    ) {
      return response
    }
    await response.body?.cancel()

    const headers = new Headers(request.headers)
    headers.set('Accept', 'text/html')
    const html = await handler(new Request(request, { headers }), ...args)
    const missing = html.status === 404
    if (!missing && !html.ok) {
      return html
    }
    await html.body?.cancel()

    const { origin, pathname } = new URL(request.url)
    const body = missing
      ? notFoundMarkdown(origin, pathname)
      : htmlOnlyMarkdown(origin, pathname)
    const out = new Headers(html.headers)
    out.delete('Content-Length')
    out.delete('Link')
    out.set('Content-Type', `${MARKDOWN_TYPE}; charset=utf-8`)
    out.set('Vary', 'Accept')
    return new Response(request.method === 'HEAD' ? null : body, {
      status: missing ? 404 : 406,
      headers: out,
    })
  }
}
