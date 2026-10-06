import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import {
  agentSkillsIndex,
  apiCatalog,
  llmsTxt,
  markdownPath,
  mcpServerCard,
  sha256Digest,
  skillFrontmatter,
} from '../src/lib/site/discovery.ts'
import { renderMarkdown, slugify } from '../src/lib/site/markdown.ts'
import { prefersMarkdown } from '../src/lib/site/negotiate.ts'
import { DOC_PAGES, findSitePage, HOME_PAGE } from '../src/lib/site/pages.ts'

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
      pages: [{ path: '/docs/cli', title: 'CLI', description: 'Commands.' }],
      links: [
        { title: 'Spec', url: 'https://example.com/s', description: 'S.' },
      ],
    })
    assert.match(text, /^# fil\n\n> Summary\.\n/)
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

  it('reads skill frontmatter and hashes the file', async () => {
    const skill = '---\nname: fil\ndescription: Store files.\n---\n\n# fil\n'
    assert.deepEqual(skillFrontmatter(skill), {
      name: 'fil',
      description: 'Store files.',
    })
    assert.throws(() => skillFrontmatter('# no frontmatter'))
    const digest = await sha256Digest(skill)
    assert.equal(
      digest,
      `sha256:${createHash('sha256').update(skill).digest('hex')}`
    )
    const index = agentSkillsIndex([
      { name: 'fil', description: 'Store files.', url: '/s', digest },
    ])
    assert.equal(index.skills[0]?.type, 'skill-md')
  })
})
