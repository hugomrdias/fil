import { skills } from 'virtual:agent-skills'
import { env } from '@/config/env'
import { NETWORKS } from '@/lib/networks'
import {
  API_CATALOG_TYPE,
  apiCatalog,
  integrationsJson,
  llmsTxt,
  markdownPath,
  mcpServerCard,
  robotsTxt,
  sitemapXml,
} from './discovery'
import { MARKDOWN_TYPE } from './negotiate'
import { AGENTS_PAGE, SITE_PAGES, type SitePage } from './pages'

/** Markdown sources in `src/content`, keyed by file path. */
const CONTENT = import.meta.glob<string>('../../content/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

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
 * Context for `llms.txt`: one way in for each kind of agent, and a link to
 * the page that explains them. Each way in owns its own instructions, such
 * as the agent skill for the CLI, so this stays a router. `llms.txt` allows
 * no headings here, so the router is a bold lead-in.
 *
 * @param origin - Site origin.
 * @see ../../content/agents.md
 */
function llmsDetails(origin: string) {
  return [
    [
      '**Pick a way in.** Each kind of agent has one:',
      '',
      `- Agents with a shell, local or in the cloud, install the agent skill: \`npx skills add ${origin}\`. It covers storing, retrieving, and verifying with the CLI.`,
      `- Browser agents open [fil-app](${origin}/). Its WebMCP tools read the account and prepare the wallet owner's approval.`,
      `- Agents that only call remote tools add the read-only MCP server at \`${env.filApiUrl}/mcp\`, over Streamable HTTP. It cannot store content.`,
    ].join('\n'),
    `A person owns the wallet and approves every agent, which never holds the wallet key. [Agents](${origin}${markdownPath(AGENTS_PAGE.path)}) explains each way in. This is a prototype that runs on the calibration test network by default.`,
  ]
}

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
    details: llmsDetails(origin),
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
      ...skills.map((skill) => ({
        title: `Agent skill: ${skill.name}`,
        url: `${origin}${skill.path}`,
        description: skill.description,
      })),
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
 * Respond with `/.well-known/integrations.json` for integrations.sh.
 *
 * @param request - Incoming request, for the site origin.
 * @see https://integrations.sh/publishing/
 */
export function integrationsResponse(request: Request) {
  const body =
    request.method === 'HEAD'
      ? null
      : JSON.stringify(
          integrationsJson(env.filApiUrl, new URL(request.url).origin),
          null,
          2
        )
  return new Response(body, { headers: agentHeaders('application/json') })
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
