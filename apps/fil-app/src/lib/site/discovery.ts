/**
 * Builders for the files agents use to discover the site: `llms.txt`, the
 * API catalog, the MCP server card, and the agent skills index.
 */

/** A page with a Markdown version, as listed in `llms.txt`. */
export interface LlmsPage {
  /** Site path, such as `/docs/cli`. */
  path: string
  /** Page title. */
  title: string
  /** One-sentence description. */
  description: string
}

/**
 * Build `llms.txt`: a Markdown index of the site for language models.
 *
 * @param options.origin - Site origin, such as `https://fil-app.hugomrdias.dev`.
 * @param options.summary - One-sentence summary of the site, shown as a quote.
 * @param options.details - Markdown blocks, such as paragraphs and lists,
 *   that an agent should know before it reads the pages.
 * @param options.pages - Pages with Markdown versions.
 * @param options.links - Other resources, each a title and an absolute URL.
 * @see https://llmstxt.org
 */
export function llmsTxt(options: {
  origin: string
  summary: string
  details: string[]
  pages: LlmsPage[]
  links: { title: string; url: string; description: string }[]
}) {
  const docs = options.pages.map(
    (page) =>
      `- [${page.title}](${options.origin}${markdownPath(page.path)}): ${page.description}`
  )
  const links = options.links.map(
    (link) => `- [${link.title}](${link.url}): ${link.description}`
  )
  return [
    '# fil',
    '',
    `> ${options.summary}`,
    '',
    ...options.details.flatMap((block) => [block, '']),
    '## Docs',
    '',
    ...docs,
    '',
    '## Optional',
    '',
    ...links,
    '',
  ].join('\n')
}

/**
 * Path of a page's Markdown version: `/` becomes `/index.md`, and other
 * paths get a `.md` suffix.
 *
 * @param path - Site path.
 */
export function markdownPath(path: string) {
  return path === '/' ? '/index.md' : `${path}.md`
}

/** Media type of an RFC 9727 API catalog. */
export const API_CATALOG_TYPE =
  'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"'

/**
 * Build the RFC 9727 API catalog: a linkset that points to fil-api, its
 * OpenAPI document, and its reference docs.
 *
 * @param apiUrl - fil-api origin.
 * @see https://www.rfc-editor.org/rfc/rfc9727
 */
export function apiCatalog(apiUrl: string) {
  return {
    linkset: [
      {
        anchor: `${apiUrl}/`,
        'service-desc': [
          { href: `${apiUrl}/openapi.json`, type: 'application/json' },
        ],
        'service-doc': [{ href: `${apiUrl}/docs`, type: 'text/html' }],
        status: [{ href: `${apiUrl}/health`, type: 'application/json' }],
      },
    ],
  }
}

/**
 * Build the MCP server card for fil-api's MCP server, in the SEP-2127
 * format.
 *
 * @param apiUrl - fil-api origin.
 * @param siteUrl - Site origin, used as the website URL.
 * @see https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2127-mcp-server-cards.md
 */
export function mcpServerCard(apiUrl: string, siteUrl: string) {
  return {
    $schema:
      'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
    name: 'dev.hugomrdias/fil-api',
    title: 'fil-api',
    version: '0.0.0',
    description:
      'Read-only Filecoin Onchain Cloud data: storage providers, data sets, pieces, Filecoin Pay rails, and session keys on mainnet and calibration.',
    websiteUrl: `${siteUrl}/docs/api`,
    repository: {
      url: 'https://github.com/hugomrdias/fil',
      source: 'github',
      subfolder: 'apps/fil-api',
    },
    remotes: [
      {
        type: 'streamable-http',
        url: `${apiUrl}/mcp`,
        supportedProtocolVersions: ['2025-11-25', '2025-06-18', '2025-03-26'],
      },
    ],
  }
}

/** A skill listed in the agent skills discovery index. */
export interface DiscoverySkill {
  /** Skill name from its frontmatter. */
  name: string
  /** Skill description from its frontmatter. */
  description: string
  /** Path or URL of the `SKILL.md` file. */
  url: string
  /** `sha256:` digest of the file's bytes. */
  digest: string
}

/**
 * Build the agent skills discovery index.
 *
 * @param skills - Single-file skills to list.
 * @see https://github.com/cloudflare/agent-skills-discovery-rfc
 */
export function agentSkillsIndex(skills: DiscoverySkill[]) {
  return {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: skills.map((skill) => ({
      name: skill.name,
      type: 'skill-md',
      description: skill.description,
      url: skill.url,
      digest: skill.digest,
    })),
  }
}

/**
 * Read `name` and `description` from a `SKILL.md` file's YAML frontmatter.
 * Only single-line `key: value` fields are supported.
 *
 * @param markdown - Contents of a `SKILL.md` file.
 * @see https://agentskills.io/specification
 */
export function skillFrontmatter(markdown: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)
  const fields = new Map<string, string>()
  for (const line of match?.[1]?.split(/\r?\n/) ?? []) {
    const field = /^([a-z-]+):\s*(.*)$/.exec(line)
    if (field?.[1] && field[2] !== undefined) {
      fields.set(field[1], field[2].trim())
    }
  }
  const name = fields.get('name')
  const description = fields.get('description')
  if (!name || !description) {
    throw new Error('SKILL.md frontmatter needs a name and a description')
  }
  return { name, description }
}

/**
 * SHA-256 digest of a text's UTF-8 bytes, as `sha256:<hex>`.
 *
 * @param text - Text to hash.
 */
export async function sha256Digest(text: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  )
  const hex = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
  return `sha256:${hex}`
}
