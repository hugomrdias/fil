/** Media type of the Markdown versions of site pages. */
export const MARKDOWN_TYPE = 'text/markdown'

/**
 * Quality value an `Accept` header gives a media type, from the most
 * specific matching range: `type/subtype`, then `type/*`, then `*\/*`.
 *
 * @param accept - Parsed `Accept` ranges.
 * @param type - Media type such as `text/html`.
 * @see https://www.rfc-editor.org/rfc/rfc9110#name-accept
 */
function quality(accept: { range: string; q: number }[], type: string) {
  const [main] = type.split('/')
  for (const range of [type, `${main}/*`, '*/*']) {
    const match = accept.find((entry) => entry.range === range)
    if (match) {
      return match.q
    }
  }
  return 0
}

/**
 * Parse an `Accept` header into media ranges with their quality values.
 *
 * @param header - `Accept` header value.
 */
function parseAccept(header: string) {
  return header
    .split(',')
    .map((part) => {
      const [range = '', ...params] = part.split(';').map((s) => s.trim())
      const q = params
        .map((param) => /^q=([0-9.]+)$/i.exec(param)?.[1])
        .find((value) => value !== undefined)
      const parsed = q === undefined ? 1 : Number.parseFloat(q)
      return {
        range: range.toLowerCase(),
        q: Number.isFinite(parsed) ? parsed : 0,
      }
    })
    .filter((entry) => entry.range !== '')
}

/**
 * Whether a request asks for Markdown rather than HTML. The client must name
 * `text/markdown` itself, with a quality at least as high as HTML's, so a
 * browser's `*\/*` never gets Markdown.
 *
 * @param header - `Accept` header value, or null when absent.
 * @see https://www.rfc-editor.org/rfc/rfc9110#name-content-negotiation
 */
export function prefersMarkdown(header: string | null) {
  if (!header) {
    return false
  }
  const accept = parseAccept(header)
  const markdown = accept.find((entry) => entry.range === MARKDOWN_TYPE)
  if (!markdown || markdown.q <= 0) {
    return false
  }
  return markdown.q >= quality(accept, 'text/html')
}
