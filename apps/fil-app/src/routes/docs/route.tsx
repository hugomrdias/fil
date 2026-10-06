import { createFileRoute, Outlet } from '@tanstack/react-router'
import { DocsLayout } from '@/components/doc-page'

export const Route = createFileRoute('/docs')({
  component: () => (
    <DocsLayout>
      <Outlet />
    </DocsLayout>
  ),
})
