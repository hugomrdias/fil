import { Marked, type Token, type Tokens } from 'marked'

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
 * A marked instance whose headings get unique `id` attributes, so links such
 * as `/docs/cli#log-in` work. Ids stay unique across every parse call on the
 * same instance.
 *
 * @see https://marked.js.org/using_pro#renderer
 */
function createMarked() {
  const seen = new Map<string, number>()
  return new Marked({
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
}

/**
 * Render a site page's Markdown to HTML. Headings get `id` attributes, so
 * links such as `/docs/cli#log-in` work.
 *
 * @param markdown - Page Markdown.
 * @see https://marked.js.org/using_pro#renderer
 */
export function renderMarkdown(markdown: string) {
  return createMarked().parse(markdown, { async: false })
}

/** A piece of a tab: rendered Markdown, or a code block to show as a terminal. */
export type MarkdownTabPart =
  | { type: 'html'; html: string }
  | { type: 'code'; lang: string; code: string }

/** One tab of a tabs block: the `###` heading text and what follows it. */
export interface MarkdownTab {
  /** Heading text, as plain text. */
  label: string
  /** Tab content in source order. */
  parts: MarkdownTabPart[]
}

/** A piece of a page: rendered Markdown, or a set of tabs. */
export type MarkdownBlock =
  | { type: 'html'; html: string }
  | { type: 'tabs'; tabs: MarkdownTab[] }

/** Comments that open and close a tabs block in a content file. */
const TABS_OPEN = '<!-- tabs -->'
const TABS_CLOSE = '<!-- /tabs -->'

/**
 * Whether a token is the given marker comment on its own.
 *
 * @param token - Block token.
 * @param marker - Comment to match.
 */
function isMarker(token: Token, marker: string) {
  return token.type === 'html' && token.raw.trim() === marker
}

/**
 * Render a site page's Markdown to blocks, so the page can show some of it
 * as components. Between `<!-- tabs -->` and `<!-- /tabs -->`, each `###`
 * heading starts a tab, and code blocks stay as source for a terminal with a
 * copy button. The Markdown version keeps the headings, so it reads the same
 * without tabs.
 *
 * @param markdown - Page Markdown.
 */
export function renderMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const marked = createMarked()
  const blocks: MarkdownBlock[] = []
  let pending: Token[] = []
  let tabs: MarkdownTab[] | undefined

  /** Render the pending tokens into the current tab or the page. */
  const flush = () => {
    if (pending.length === 0) {
      return
    }
    const html = marked.parser(pending)
    pending = []
    if (html.trim() === '') {
      return
    }
    if (tabs === undefined) {
      blocks.push({ type: 'html', html })
    } else {
      tabs.at(-1)?.parts.push({ type: 'html', html })
    }
  }

  for (const token of marked.lexer(markdown)) {
    if (tabs === undefined && isMarker(token, TABS_OPEN)) {
      flush()
      tabs = []
    } else if (tabs !== undefined && isMarker(token, TABS_CLOSE)) {
      flush()
      blocks.push({ type: 'tabs', tabs })
      tabs = undefined
    } else if (
      tabs !== undefined &&
      token.type === 'heading' &&
      token.depth === 3
    ) {
      flush()
      tabs.push({ label: token.text.replaceAll('`', ''), parts: [] })
    } else if (tabs !== undefined && token.type === 'code') {
      flush()
      tabs
        .at(-1)
        ?.parts.push({ type: 'code', lang: token.lang ?? '', code: token.text })
    } else if (tabs === undefined || tabs.length > 0) {
      pending.push(token)
    } else if (token.type !== 'space') {
      throw new Error(`Content before the first tab: ${token.raw.trim()}`)
    }
  }
  if (tabs !== undefined) {
    throw new Error(`Missing ${TABS_CLOSE}`)
  }
  flush()
  return blocks
}
