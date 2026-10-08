import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  apiCatalog,
  llmsTxt,
  markdownPath,
  mcpServerCard,
  robotsTxt,
  scriptJson,
  sitemapXml,
  softwareApplication,
} from '../src/lib/site/discovery.ts'
import { renderMarkdown, slugify } from '../src/lib/site/markdown.ts'
import { withMarkdownErrors } from '../src/lib/site/markdown-errors.ts'
import { prefersMarkdown } from '../src/lib/site/negotiate.ts'
import {
  DOC_PAGES,
  findSitePage,
  HOME_PAGE,
  SITE_PAGES,
} from '../src/lib/site/pages.ts'

describe('prefersMarkdown', () => {
  it('serves HTML to browsers', () => {
    assert.equal(
      prefersMarkdown(
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      ),
      false
    )
    assert.equal(prefersMarkdown('*/*'), false)
    assert.equal(prefersMarkdown(null), false)
  })

  it('serves Markdown when the client names it first or alone', () => {
    assert.equal(prefersMarkdown('text/markdown'), true)
    assert.equal(prefersMarkdown('text/markdown, text/html'), true)
    assert.equal(prefersMarkdown('text/markdown, */*;q=0.1'), true)
    assert.equal(prefersMarkdown('text/html;q=0.5, text/markdown'), true)
  })

  it('serves HTML when the client ranks it higher or refuses Markdown', () => {
    assert.equal(prefersMarkdown('text/html, text/markdown;q=0.9'), false)
    assert.equal(prefersMarkdown('text/markdown;q=0'), false)
    assert.equal(prefersMarkdown('text/*, text/markdown;q=0.5'), false)
  })
})

describe('findSitePage', () => {
  it('finds pages by path, .md suffix, and trailing slash', () => {
    assert.deepEqual(findSitePage('/docs/cli'), {
      page: DOC_PAGES[1],
      suffixed: false,
    })
    assert.equal(findSitePage('/docs/cli.md')?.suffixed, true)
    assert.equal(findSitePage('/docs/cli/')?.page.slug, 'cli')
    assert.equal(findSitePage('/agents.md')?.page.slug, 'agents')
  })

  it('maps / and /index.md to the home page', () => {
    assert.equal(findSitePage('/')?.page, HOME_PAGE)
    assert.deepEqual(findSitePage('/index.md'), {
      page: HOME_PAGE,
      suffixed: true,
    })
  })

  it('ignores other paths', () => {
    assert.equal(findSitePage('/mainnet'), undefined)
    assert.equal(findSitePage('/docs/agents'), undefined)
    assert.equal(
      findSitePage('/.well-known/agent-skills/fil/SKILL.md'),
      undefined
    )
  })
})

describe('markdownPath', () => {
  it('adds .md, and names the home page index.md', () => {
    assert.equal(markdownPath('/docs/cli'), '/docs/cli.md')
    assert.equal(markdownPath('/'), '/index.md')
  })
})

describe('renderMarkdown', () => {
  it('gives headings unique ids', () => {
    const html = renderMarkdown('# Log in\n\n## `fil` setup\n\n## Log in')
    assert.match(html, /<h1 id="log-in">Log in<\/h1>/)
    assert.match(html, /<h2 id="fil-setup"><code>fil<\/code> setup<\/h2>/)
    assert.match(html, /<h2 id="log-in-1">Log in<\/h2>/)
  })

  it('renders GitHub tables', () => {
    assert.match(
      renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |'),
      /<table>/
    )
  })

  it('slugifies punctuation away', () => {
    assert.equal(slugify('REST API and MCP server'), 'rest-api-and-mcp-server')
    assert.equal(slugify("Use fil-app's tools!"), 'use-fil-apps-tools')
  })
})

describe('llmsTxt', () => {
  it('lists pages by their Markdown URLs', () => {
    const text = llmsTxt({
      origin: 'https://example.com',
      summary: 'Summary.',
      details: ['A paragraph.', '- A rule.\n- Another rule.'],
      pages: [{ path: '/docs/cli', title: 'CLI', description: 'Commands.' }],
      links: [
        { title: 'Spec', url: 'https://example.com/s', description: 'S.' },
      ],
    })
    assert.match(
      text,
      /^# fil\n\n> Summary\.\n\nA paragraph\.\n\n- A rule\.\n- Another rule\.\n\n## Docs\n/
    )
    assert.match(
      text,
      /- \[CLI\]\(https:\/\/example\.com\/docs\/cli\.md\): Commands\./
    )
    assert.match(
      text,
      /## Optional\n\n- \[Spec\]\(https:\/\/example\.com\/s\): S\./
    )
  })
})

/** The live site, as the agent skill links to it. */
const SITE_ORIGIN = 'https://fil-app.hugomrdias.dev'

/**
 * Heading ids of a site page, as the rendered page has them.
 *
 * @param slug - Content file name without `.md`.
 */
async function headingIds(slug: string) {
  const markdown = await readFile(
    new URL(`../src/content/${slug}.md`, import.meta.url),
    'utf8'
  )
  const html = renderMarkdown(markdown)
  return new Set([...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]))
}

describe('content links', () => {
  it('point to existing docs pages and headings', async () => {
    const sources = [
      ...SITE_PAGES.map((page) => ({
        name: `${page.slug}.md`,
        url: new URL(`../src/content/${page.slug}.md`, import.meta.url),
        base: page.path,
      })),
      {
        name: 'skills/fil/SKILL.md',
        url: new URL('../../../skills/fil/SKILL.md', import.meta.url),
        base: '/',
      },
    ]
    const broken: string[] = []
    for (const source of sources) {
      const markdown = await readFile(source.url, 'utf8')
      const links = [
        ...markdown.matchAll(/\]\(((?:\/|#)[^)\s]*)\)/g),
        ...markdown.matchAll(
          new RegExp(`${SITE_ORIGIN.replaceAll('.', '\\.')}(/[^\\s)]*)`, 'g')
        ),
      ].map((match) => match[1] ?? '')
      for (const link of links) {
        const [path = '', fragment] = link.split('#')
        const page = findSitePage(path === '' ? source.base : path)?.page
        if (page === undefined) {
          // Only docs pages are checked; app and discovery paths are routes.
          if (path.startsWith('/docs') || path.startsWith('/agents')) {
            broken.push(`${source.name}: ${link}`)
          }
          continue
        }
        if (fragment && !(await headingIds(page.slug)).has(fragment)) {
          broken.push(`${source.name}: ${link}`)
        }
      }
    }
    assert.deepEqual(broken, [])
  })
})

describe('discovery documents', () => {
  it('builds an RFC 9727 linkset for fil-api', () => {
    const [entry] = apiCatalog('https://api.example').linkset
    assert.equal(entry?.anchor, 'https://api.example/')
    assert.equal(
      entry?.['service-desc'][0]?.href,
      'https://api.example/openapi.json'
    )
  })

  it('builds a server card with one Streamable HTTP remote', () => {
    const card = mcpServerCard('https://api.example', 'https://site.example')
    assert.equal(card.name.split('/').length, 2)
    assert.deepEqual(
      card.remotes.map((remote) => [remote.type, remote.url]),
      [['streamable-http', 'https://api.example/mcp']]
    )
  })

  it('lists absolute URLs in the sitemap and links it from robots.txt', () => {
    const xml = sitemapXml('https://site.example', ['/', '/docs/cli?a=1&b=2'])
    assert.match(xml, /<loc>https:\/\/site\.example\/<\/loc>/)
    assert.match(
      xml,
      /<loc>https:\/\/site\.example\/docs\/cli\?a=1&amp;b=2<\/loc>/
    )
    assert.match(
      robotsTxt('https://site.example'),
      /^Sitemap: https:\/\/site\.example\/sitemap\.xml$/m
    )
  })

  it('describes fil as a SoftwareApplication in script-safe JSON', () => {
    const app = softwareApplication({
      origin: 'https://site.example',
      description: 'Store </script> files.',
      image: 'https://site.example/og.png',
    })
    assert.equal(app['@type'], 'SoftwareApplication')
    assert.equal(app.url, 'https://site.example/')
    const json = scriptJson(app)
    assert.equal(json.includes('</script>'), false)
    assert.deepEqual(JSON.parse(json), app)
  })
})

describe('withMarkdownErrors', () => {
  /**
   * A fake Start handler: 406 unless the request accepts HTML, then the
   * status for the path from `pages`, or 404.
   */
  function fakeStart(pages: Record<string, number>) {
    const seen: string[] = []
    const handler = (request: Request) => {
      const accept = request.headers.get('accept') ?? '*/*'
      seen.push(accept)
      if (!/(^|,)\s*(\*\/\*|text\/html)/.test(accept)) {
        return new Response('{"error":"Only HTML"}', { status: 406 })
      }
      const status = pages[new URL(request.url).pathname] ?? 404
      return new Response('<html></html>', {
        status,
        headers: {
          'Content-Type': 'text/html',
          'X-Frame-Options': 'DENY',
          ...(status === 307 ? { Location: '/docs/quickstart' } : {}),
        },
      })
    }
    return { fetch: withMarkdownErrors(handler), seen }
  }

  const markdown = { headers: { Accept: 'text/markdown' } }

  it('answers a missing page with a Markdown 404', async () => {
    const start = fakeStart({})
    const res = await start.fetch(
      new Request('https://site.example/nope', markdown)
    )
    assert.equal(res.status, 404)
    assert.match(res.headers.get('content-type') ?? '', /^text\/markdown/)
    assert.equal(res.headers.get('x-frame-options'), 'DENY')
    const body = await res.text()
    assert.match(body, /`\/nope`/)
    assert.match(body, /https:\/\/site\.example\/llms\.txt/)
    assert.deepEqual(start.seen, ['text/markdown', 'text/html'])
  })

  it('answers an HTML-only page with a Markdown 406', async () => {
    const start = fakeStart({ '/calibration': 200, '/docs/cli': 200 })
    const res = await start.fetch(
      new Request('https://site.example/calibration', markdown)
    )
    assert.equal(res.status, 406)
    assert.match(await res.text(), /Accept: text\/html/)
    const doc = await start.fetch(
      new Request('https://site.example/docs/cli', {
        headers: { Accept: 'application/json' },
      })
    )
    assert.equal(doc.status, 406)
    assert.match(await doc.text(), /\/docs\/cli\.md/)
  })

  it('passes redirects, HEAD bodies, and other responses through', async () => {
    const start = fakeStart({ '/docs': 307 })
    const redirect = await start.fetch(
      new Request('https://site.example/docs', markdown)
    )
    assert.equal(redirect.status, 307)
    const head = await start.fetch(
      new Request('https://site.example/nope', { ...markdown, method: 'HEAD' })
    )
    assert.equal(head.status, 404)
    assert.equal(await head.text(), '')
    const html = await start.fetch(new Request('https://site.example/nope'))
    assert.equal(html.status, 404)
    assert.match(html.headers.get('content-type') ?? '', /^text\/html/)
  })
})
