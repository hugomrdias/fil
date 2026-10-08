import { createFileRoute } from '@tanstack/react-router'
import { DocArticle, DocsLayout, pageHead } from '@/components/doc-page'
import { getPageContent } from '@/lib/site/page-content'
import { AGENTS_PAGE } from '@/lib/site/pages'

export const Route = createFileRoute('/agents')({
  loader: () => getPageContent({ data: AGENTS_PAGE.slug }),
  head: () => pageHead(AGENTS_PAGE),
  component: AgentsRoute,
})

/** Agents page: the CLI and skill, key approval, MCP, and discovery files. */
function AgentsRoute() {
  const { html } = Route.useLoaderData()
  return (
    <DocsLayout>
      <DocArticle html={html} page={AGENTS_PAGE} />
    </DocsLayout>
  )
}
