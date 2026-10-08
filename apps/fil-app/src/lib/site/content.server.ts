import { env } from '@/config/env'
import { NETWORKS } from '@/lib/networks'
import {
  API_CATALOG_TYPE,
  agentSkillsIndex,
  apiCatalog,
  llmsTxt,
  mcpServerCard,
  robotsTxt,
  sha256Digest,
  sitemapXml,
  skillFrontmatter,
} from './discovery'
import { MARKDOWN_TYPE } from './negotiate'
import { SITE_PAGES, type SitePage } from './pages'

/** Markdown sources in `src/content`, keyed by file path. */
const CONTENT = import.meta.glob<string>('../../content/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/**
 * `SKILL.md` of each agent skill in the repository's root `skills/`
 * directory, keyed by file path. The fil-cli build copies the same files.
 */
const SKILLS = import.meta.glob<string>('../../../../../skills/*/SKILL.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/**
 * Path of a skill's `SKILL.md` under the agent skills well-known prefix.
 *
 * @param name - Skill name.
 */
export function skillPath(name: string) {
  return `/.well-known/agent-skills/${name}/SKILL.md`
}

/**
 * `SKILL.md` of a skill in the root `skills/` directory.
 *
 * @param name - Skill name, which is also its directory name.
 */
function skillMarkdown(name: string) {
  return SKILLS[`../../../../../skills/${name}/SKILL.md`]
}

/**
 * Markdown source of a site page.
 *
 * @param page - Site page.
 */
export function pageMarkdown(page: SitePage) {
  const markdown = CONTENT[`../../content/${page.slug}.md`]
  if (markdown === undefined) {
    throw new Error(`Missing content for ${page.path}`)
  }
  return markdown
}

/**
 * Headers for files that agents fetch from other origins.
 *
 * @param type - Content type.
 */
function agentHeaders(type: string) {
  return {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
  }
}

/**
 * Respond with a page's Markdown.
 *
 * @param page - Site page.
 * @param method - Request method; `HEAD` gets no body.
 */
export function markdownResponse(page: SitePage, method: string) {
  return new Response(method === 'HEAD' ? null : pageMarkdown(page), {
    headers: {
      ...agentHeaders(`${MARKDOWN_TYPE}; charset=utf-8`),
      Vary: 'Accept',
    },
  })
}

/** One-sentence summary of the project, quoted at the top of `llms.txt`. */
const LLMS_SUMMARY =
  'fil stores files and folders on Filecoin and returns links to share them, through a CLI, a read-only MCP server, or a web app with WebMCP tools for browser agents.'

/**
 * Context for `llms.txt`: when an agent should reach for fil, and what it
 * needs to know first. How to run the CLI belongs in the agent skill, so
 * this stays short. `llms.txt` allows no headings here, so the "when to use"
 * section is a bold lead-in.
 */
const LLMS_DETAILS = [
  [
    '**When to use fil.** Reach for fil when an agent needs to:',
    '',
    '- Store a file or a folder on Filecoin and get a link to share it: run `fil put` in a shell.',
    '- Download content it stored and verify it: run `fil get`.',
    '- Read Filecoin data, such as storage providers, data sets, pieces, Filecoin Pay rails, and session keys, on mainnet or calibration: call the MCP server or the REST API.',
    "- Help a person fund storage or approve the agent's key in a browser: use fil-app's WebMCP tools.",
  ].join('\n'),
  'This is a prototype that runs on the calibration test network by default. Agents never hold the wallet key: the wallet owner approves their access in the web app. The agent skill explains how to use the CLI.',
]

/**
 * Respond with `llms.txt`, or `llms-full.txt` with every page inline.
 *
 * @param request - Incoming request, for the site origin.
 * @param full - Whether to include the pages' Markdown.
 * @see https://llmstxt.org
 */
export function llmsResponse(request: Request, full: boolean) {
  const origin = new URL(request.url).origin
  const index = llmsTxt({
    origin,
    summary: LLMS_SUMMARY,
    details: LLMS_DETAILS,
    pages: SITE_PAGES,
    links: [
      {
        title: 'OpenAPI document',
        url: `${env.filApiUrl}/openapi.json`,
        description: 'fil-api REST API, OpenAPI 3.1',
      },
      {
        title: 'MCP server card',
        url: `${origin}/.well-known/mcp/server-card.json`,
        description: 'fil-api MCP server, Streamable HTTP',
      },
      {
        title: 'Agent skill',
        url: `${origin}${skillPath('fil')}`,
        description: 'SKILL.md that teaches an agent to use the fil CLI',
      },
    ],
  })
  const body = full
    ? [index, ...SITE_PAGES.map((page) => pageMarkdown(page))].join('\n\n')
    : index
  return new Response(body, {
    headers: agentHeaders('text/plain; charset=utf-8'),
  })
}

/** Site paths listed in the sitemap: the site pages and each explorer. */
const SITEMAP_PATHS = [
  ...SITE_PAGES.map((page) => page.path),
  ...NETWORKS.map((network) => `/${network}`),
]

/**
 * Respond with the XML sitemap.
 *
 * @param request - Incoming request, for the site origin.
 * @see https://www.sitemaps.org/protocol.html
 */
export function sitemapResponse(request: Request) {
  const origin = new URL(request.url).origin
  return new Response(sitemapXml(origin, SITEMAP_PATHS), {
    headers: agentHeaders('application/xml; charset=utf-8'),
  })
}

/**
 * Respond with `robots.txt`, which points to the sitemap.
 *
 * @param request - Incoming request, for the site origin.
 * @see https://www.rfc-editor.org/rfc/rfc9309
 */
export function robotsResponse(request: Request) {
  const origin = new URL(request.url).origin
  return new Response(robotsTxt(origin), {
    headers: agentHeaders('text/plain; charset=utf-8'),
  })
}

/**
 * Respond with the RFC 9727 API catalog. A `HEAD` request gets the
 * `api-catalog` link relation the RFC requires, and no body.
 *
 * @param request - Incoming request.
 * @see https://www.rfc-editor.org/rfc/rfc9727#name-the-api-catalog-well-known-
 */
export function apiCatalogResponse(request: Request) {
  const headers = {
    ...agentHeaders(API_CATALOG_TYPE),
    Link: '</.well-known/api-catalog>; rel="api-catalog"',
  }
  const body =
    request.method === 'HEAD'
      ? null
      : JSON.stringify(apiCatalog(env.filApiUrl), null, 2)
  return new Response(body, { headers })
}

/**
 * Respond with the MCP server card for fil-api.
 *
 * @param request - Incoming request, for the site origin.
 */
export function serverCardResponse(request: Request) {
  const card = mcpServerCard(env.filApiUrl, new URL(request.url).origin)
  return new Response(JSON.stringify(card, null, 2), {
    headers: agentHeaders('application/json'),
  })
}

/** Respond with the agent skills discovery index. */
export async function agentSkillsResponse() {
  const skills = await Promise.all(
    Object.values(SKILLS).map(async (markdown) => {
      const { name, description } = skillFrontmatter(markdown)
      return {
        name,
        description,
        url: skillPath(name),
        digest: await sha256Digest(markdown),
      }
    })
  )
  return new Response(JSON.stringify(agentSkillsIndex(skills), null, 2), {
    headers: agentHeaders('application/json'),
  })
}

/**
 * Respond with a skill's `SKILL.md`, or 404 for an unknown skill.
 *
 * @param name - Skill name from the request path.
 */
export function skillResponse(name: string) {
  const markdown = skillMarkdown(name)
  if (markdown === undefined) {
    return new Response('Not found', { status: 404 })
  }
  return new Response(markdown, {
    headers: agentHeaders(`${MARKDOWN_TYPE}; charset=utf-8`),
  })
}
