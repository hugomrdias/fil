import { env } from '@/config/env'
import skillMarkdown from '../../../../../packages/fil-cli/skills/fil/SKILL.md?raw'
import {
  API_CATALOG_TYPE,
  agentSkillsIndex,
  apiCatalog,
  llmsTxt,
  mcpServerCard,
  sha256Digest,
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

/** Path of the `fil` skill under the agent skills well-known prefix. */
export const SKILL_PATH = '/.well-known/agent-skills/fil/SKILL.md'

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
  'fil stores files and folders on Filecoin Onchain Cloud and returns links to share them, through a CLI, a read-only MCP server, or a web app with WebMCP tools for browser agents.'

/**
 * Context for `llms.txt`. How to run the CLI belongs in the agent skill, so
 * this stays short.
 */
const LLMS_DETAILS = [
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
        url: `${origin}${SKILL_PATH}`,
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
  const { name, description } = skillFrontmatter(skillMarkdown)
  const index = agentSkillsIndex([
    {
      name,
      description,
      url: SKILL_PATH,
      digest: await sha256Digest(skillMarkdown),
    },
  ])
  return new Response(JSON.stringify(index, null, 2), {
    headers: agentHeaders('application/json'),
  })
}

/** Respond with the `fil` skill's `SKILL.md`. */
export function skillResponse() {
  return new Response(skillMarkdown, {
    headers: agentHeaders(`${MARKDOWN_TYPE}; charset=utf-8`),
  })
}
