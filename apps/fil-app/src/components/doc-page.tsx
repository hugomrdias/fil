import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { SiteShell } from '@/components/site-shell'
import { env } from '@/config/env'
import { markdownPath } from '@/lib/site/discovery'
import { DOC_PAGES, type SitePage } from '@/lib/site/pages'

const NAV_LINK =
  'block rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground'

/**
 * Link to a docs page. Agent setup lives at `/agents`, the rest under
 * `/docs`.
 *
 * @param props.page - Docs page.
 * @param props.className - Link classes.
 */
function DocLink(props: { page: SitePage; className: string }) {
  if (props.page.path === '/agents') {
    return (
      <Link className={props.className} to="/agents">
        {props.page.title}
      </Link>
    )
  }
  return (
    <Link
      className={props.className}
      params={{ slug: props.page.slug }}
      to="/docs/$slug"
    >
      {props.page.title}
    </Link>
  )
}

/**
 * Docs frame: the page list beside the content on wide screens, and above it
 * on narrow ones.
 *
 * @param props.children - Page content.
 */
export function DocsLayout(props: { children: ReactNode }) {
  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:flex-row lg:gap-12 lg:px-8 lg:py-12">
        <nav aria-label="Docs" className="lg:w-52 lg:shrink-0">
          <ul className="flex flex-wrap gap-1 lg:sticky lg:top-24 lg:flex-col">
            {DOC_PAGES.map((page) => (
              <li key={page.path}>
                <DocLink className={NAV_LINK} page={page} />
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1">{props.children}</div>
      </div>
    </SiteShell>
  )
}

/**
 * A docs page rendered from Markdown on the server, with a link to its
 * Markdown version.
 *
 * @param props.page - Docs page.
 * @param props.html - Rendered Markdown.
 */
export function DocArticle(props: { page: SitePage; html: string }) {
  return (
    <article className="max-w-3xl">
      <div
        className="prose prose-zinc max-w-none dark:prose-invert prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-4xl prose-a:text-primary prose-a:underline-offset-4 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:border prose-pre:bg-muted prose-pre:text-foreground prose-table:block prose-table:overflow-x-auto prose-th:whitespace-nowrap"
        // The HTML comes from the Markdown files in src/content.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted, server-rendered content
        dangerouslySetInnerHTML={{ __html: props.html }}
      />
      <p className="mt-12 border-t pt-6 text-sm text-muted-foreground">
        This page is also available as{' '}
        <a
          className="text-primary underline-offset-4 hover:underline"
          href={markdownPath(props.page.path)}
        >
          Markdown
        </a>
        .
      </p>
    </article>
  )
}

/**
 * Route `head` for a site page: title, description, canonical URL, Open
 * Graph tags, and the Markdown alternate. The root route adds the site-wide
 * Open Graph tags.
 *
 * @param page - Site page.
 * @param title - Document title; defaults to `<page title> · fil`.
 * @see https://ogp.me
 */
export function pageHead(page: SitePage, title = `${page.title} · fil`) {
  const url = `${env.siteUrl}${page.path}`
  return {
    meta: [
      { title },
      { name: 'description', content: page.description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: page.description },
      { property: 'og:url', content: url },
    ],
    links: [
      { rel: 'canonical', href: url },
      {
        rel: 'alternate',
        type: 'text/markdown',
        href: markdownPath(page.path),
      },
    ],
  }
}
