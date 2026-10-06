import { createFileRoute, notFound } from '@tanstack/react-router'
import { DocArticle, pageHead } from '@/components/doc-page'
import { getPageContent } from '@/lib/site/page-content'
import { DOC_PAGES } from '@/lib/site/pages'

export const Route = createFileRoute('/docs/$slug')({
  loader: async ({ params }) => {
    // Agent setup has its own route at /agents.
    const page = DOC_PAGES.find(
      (candidate) => candidate.path === `/docs/${params.slug}`
    )
    if (!page) {
      throw notFound()
    }
    const { html } = await getPageContent({ data: page.slug })
    return { page, html }
  },
  head: ({ loaderData }) => (loaderData ? pageHead(loaderData.page) : {}),
  component: DocRoute,
})

/** A docs page under `/docs`. */
function DocRoute() {
  const { page, html } = Route.useLoaderData()
  return <DocArticle html={html} page={page} />
}
