/**
 * Site pages with a Markdown source in `src/content`. Each one also serves
 * its Markdown at `<path>.md`, or at its own path when the request prefers
 * `text/markdown`.
 */

/** A site page backed by a Markdown file. */
export interface SitePage {
  /** Site path. */
  path: string
  /** File name in `src/content`, without `.md`. */
  slug: string
  /** Page title. */
  title: string
  /** One-sentence description, for `<meta>` and `llms.txt`. */
  description: string
}

/** The landing page's Markdown version. Its HTML is a React page. */
export const HOME_PAGE: SitePage = {
  path: '/',
  slug: 'index',
  title: 'Overview',
  description:
    'Store files and folders on Filecoin from a terminal or an agent, and get links back.',
}

/** Agent setup page. */
export const AGENTS_PAGE: SitePage = {
  path: '/agents',
  slug: 'agents',
  title: 'Agent setup',
  description:
    'The way in for each kind of agent: local, cloud, browser, or chat app with connectors, and how the wallet owner approves its key.',
}

/** Docs pages under `/docs`, in navigation order. */
export const DOC_PAGES: SitePage[] = [
  {
    path: '/docs/quickstart',
    slug: 'quickstart',
    title: 'Quickstart',
    description:
      'Install fil, log in, store a file, and download it again on the calibration network.',
  },
  {
    path: '/docs/cli',
    slug: 'cli',
    title: 'CLI',
    description:
      'How fil works: log in, check the account, store, retrieve, delete, resume, and read its JSON output.',
  },
  {
    path: '/docs/retrieve',
    slug: 'retrieve',
    title: 'Retrieve and verify',
    description:
      'What the PieceCID, the root CID, and each retrieval link check, how to find stored content, and how to store without the CLI.',
  },
  AGENTS_PAGE,
  {
    path: '/docs/api',
    slug: 'api',
    title: 'REST API and MCP server',
    description:
      'fil-api routes, retrieval redirects, MCP tools, rate limits, and conventions.',
  },
  {
    path: '/docs/app',
    slug: 'app',
    title: 'Web app',
    description:
      'The explorer, the wallet dashboard, setup links, and the WebMCP tools in fil-app.',
  },
]

/** Every page with a Markdown version. */
export const SITE_PAGES: SitePage[] = [HOME_PAGE, ...DOC_PAGES]

/**
 * Find the page that serves a path, as HTML or as Markdown. A trailing
 * slash and a `.md` suffix both resolve to the page.
 *
 * @param pathname - Request path.
 * @returns The page, and whether the path asked for Markdown by suffix.
 */
export function findSitePage(pathname: string) {
  const suffixed = pathname.endsWith('.md')
  let path = suffixed ? pathname.slice(0, -'.md'.length) : pathname
  if (path === '/index') {
    path = '/'
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }
  const page = SITE_PAGES.find((candidate) => candidate.path === path)
  return page ? { page, suffixed } : undefined
}
