/**
 * Builders for the files agents use to discover the site: `llms.txt`, the
 * API catalog, and the MCP server card. The
 * `@hugomrdias/vite-plugin-agent-skills` plugin writes the agent skills index.
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
 * OpenAPI document, its reference docs, and, as an `item`, its MCP server.
 * integrations.sh reads MCP endpoints from `item` links.
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
        item: [{ href: `${apiUrl}/mcp` }],
      },
    ],
  }
}

/**
 * Build `/.well-known/integrations.json`, the owner declaration that
 * integrations.sh reads: fil-api's REST API and MCP server, which need no
 * credentials, and the `fil` CLI, which needs a session key. Each entry is
 * marked as declared by this file.
 *
 * @param apiUrl - fil-api origin.
 * @param siteUrl - Site origin, which serves this file and the docs.
 * @see https://integrations.sh/publishing/
 * @see https://github.com/UsefulSoftwareCo/integrations/blob/main/src/lib/discovery-schema.ts
 */
export function integrationsJson(apiUrl: string, siteUrl: string) {
  const basis = {
    via: 'declared',
    source: `${siteUrl}/.well-known/integrations.json`,
  }
  return {
    version: 3,
    summary:
      'fil stores files and folders on Filecoin with an npm CLI, and serves Filecoin storage data through a public, read-only REST API and MCP server.',
    credentials: {
      fil_session_key: {
        type: 'signature',
        label: 'fil session key',
        generateUrl: `${siteUrl}/dashboard/session-keys`,
        setup: [
          'Run `fil login`. It makes a session key on the machine and returns a fil-app approval link, which the wallet owner opens to approve the key with their wallet. The CLI finds the approval on chain.',
          'For CI or a cloud agent, generate, authorize, and export a key on the fil-app session keys page instead, and set `FIL_SESSION_KEY` and `FIL_ROOT_ADDRESS`.',
          'The key signs storage requests. It cannot move funds, and it expires.',
        ].join('\n\n'),
        fields: {
          sessionKey: {
            secret: true,
            description: 'The session key, as FIL_SESSION_KEY.',
          },
          rootAddress: {
            secret: false,
            description:
              'The wallet address that approved the key, as FIL_ROOT_ADDRESS.',
          },
        },
      },
    },
    surfaces: [
      {
        slug: 'fil-api',
        name: 'fil-api REST API',
        type: 'http',
        url: `${apiUrl}/`,
        spec: `${apiUrl}/openapi.json`,
        docs: `${siteUrl}/docs/api`,
        basis,
        auth: { status: 'none', basis },
      },
      {
        slug: 'fil-api-mcp',
        name: 'fil-api MCP server',
        type: 'mcp',
        url: `${apiUrl}/mcp`,
        transports: ['streamable-http'],
        docs: `${siteUrl}/docs/api#mcp-server`,
        basis,
        auth: { status: 'none', basis },
      },
      {
        slug: 'fil-cli',
        name: 'fil CLI',
        type: 'cli',
        command: 'fil',
        packages: [
          {
            registryType: 'npm',
            identifier: '@hugomrdias/fil',
            runtimeHint: 'npx',
          },
        ],
        docs: `${siteUrl}/docs/cli`,
        basis,
        auth: {
          status: 'required',
          entries: [
            {
              use: [
                {
                  id: 'fil_session_key',
                  mechanics: {
                    source: 'cli',
                    command: 'fil login',
                    env: ['FIL_SESSION_KEY', 'FIL_ROOT_ADDRESS'],
                  },
                },
              ],
              basis,
            },
          ],
        },
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
      'Read-only Filecoin data: storage providers, data sets, pieces, Filecoin Pay rails, and session keys on mainnet and calibration.',
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

/**
 * Build an XML sitemap of absolute page URLs.
 *
 * @param origin - Site origin, such as `https://fil-app.hugomrdias.dev`.
 * @param paths - Site paths to list, each starting with `/`.
 * @see https://www.sitemaps.org/protocol.html
 */
export function sitemapXml(origin: string, paths: string[]) {
  const urls = paths.map(
    (path) => `  <url><loc>${escapeXml(`${origin}${path}`)}</loc></url>`
  )
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}

/**
 * Escape the characters XML reserves in text.
 *
 * @param text - Text to escape.
 */
function escapeXml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/**
 * Build `robots.txt`: allow every crawler and point to the sitemap.
 *
 * @param origin - Site origin.
 * @see https://www.rfc-editor.org/rfc/rfc9309
 */
export function robotsTxt(origin: string) {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
}

/**
 * Build the schema.org `SoftwareApplication` that describes fil, for a
 * JSON-LD script on the landing page.
 *
 * @param options.origin - Site origin.
 * @param options.description - One-sentence description.
 * @param options.image - Absolute URL of the social image.
 * @see https://schema.org/SoftwareApplication
 */
export function softwareApplication(options: {
  origin: string
  description: string
  image: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'fil',
    description: options.description,
    url: `${options.origin}/`,
    image: options.image,
    applicationCategory: 'DeveloperApplication',
    sameAs: ['https://github.com/hugomrdias/fil'],
  }
}

/**
 * Serialize a value as JSON that is safe inside an HTML `<script>` element.
 *
 * @param value - Value to serialize.
 * @see https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements
 */
export function scriptJson(value: unknown) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}
