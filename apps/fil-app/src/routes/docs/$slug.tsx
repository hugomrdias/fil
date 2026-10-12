import { createFileRoute, notFound } from '@tanstack/react-router'
import { DocArticle, pageHead } from '@/components/doc-page'
import { getPageContent } from '@/lib/site/page-content'
import { DOC_PAGES } from '@/lib/site/pages'

export const Route = createFileRoute('/docs/$slug')({
  loader: async ({ params }) => {
    // The Agents page has its own route at /agents.
    const page = DOC_PAGES.find(
      (candidate) => candidate.path === `/docs/${params.slug}`
    )
    if (!page) {
      throw notFound()
    }
    const { blocks } = await getPageContent({ data: page.slug })
    return { page, blocks }
  },
  head: ({ loaderData }) => (loaderData ? pageHead(loaderData.page) : {}),
  component: DocRoute,
})

/** A docs page under `/docs`. */
function DocRoute() {
  const { page, blocks } = Route.useLoaderData()
  return <DocArticle blocks={blocks} page={page} />
}
