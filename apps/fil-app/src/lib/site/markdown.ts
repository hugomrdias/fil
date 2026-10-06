import { Marked, type Tokens } from 'marked'

/**
 * Turn heading text into a URL fragment: lowercase, letters, digits and
 * hyphens only.
 *
 * @param text - Heading text without Markdown.
 */
export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

/**
 * Render a site page's Markdown to HTML. Headings get `id` attributes, so
 * links such as `/docs/cli#log-in` work.
 *
 * @param markdown - Page Markdown.
 * @see https://marked.js.org/using_pro#renderer
 */
export function renderMarkdown(markdown: string) {
  const seen = new Map<string, number>()
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(
        this: { parser: { parseInline(tokens: Tokens.Generic[]): string } },
        token: Tokens.Heading
      ) {
        const base = slugify(token.text) || 'section'
        const count = seen.get(base) ?? 0
        seen.set(base, count + 1)
        const id = count === 0 ? base : `${base}-${count}`
        const html = this.parser.parseInline(token.tokens)
        return `<h${token.depth} id="${id}">${html}</h${token.depth}>\n`
      },
    },
  })
  return marked.parse(markdown, { async: false })
}
