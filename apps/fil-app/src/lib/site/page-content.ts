import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { pageMarkdown } from './content.server'
import { renderMarkdown } from './markdown'
import { SITE_PAGES } from './pages'

/**
 * Render a site page's Markdown to HTML on the server, so the Markdown
 * sources and the renderer stay out of the browser bundle.
 *
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
 */
export const getPageContent = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(({ data }) => {
    const page = SITE_PAGES.find((candidate) => candidate.slug === data)
    if (!page) {
      throw notFound()
    }
    return { html: renderMarkdown(pageMarkdown(page)) }
  })
