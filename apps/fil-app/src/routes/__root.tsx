import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { CommandMenuProvider } from '@/components/command-menu'
import { ErrorState, NotFound } from '@/components/empty-state'
import { ExplorerShell } from '@/components/site-header'
import { Toaster } from '@/components/ui/sonner'
import { WebMcpReadTools } from '@/components/webmcp-read-tools'
import { WebMcpTools } from '@/components/webmcp-tools'

/** Router context shared by all routes. */
export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => (
    <ExplorerShell>
      <NotFound />
    </ExplorerShell>
  ),
  errorComponent: ({ error, reset }) => (
    <ExplorerShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <ErrorState error={error} reset={reset} />
      </div>
    </ExplorerShell>
  ),
})

/**
 * App root: the command menu, toasts, and WebMCP tools. The explorer and
 * the dashboard each render their own frame.
 */
function RootLayout() {
  return (
    <CommandMenuProvider>
      <Outlet />
      <WebMcpTools />
      <WebMcpReadTools />
      <Toaster position="bottom-right" richColors />
    </CommandMenuProvider>
  )
}
