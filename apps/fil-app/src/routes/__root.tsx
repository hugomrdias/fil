import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { ErrorState } from '@/components/empty-state'
import { SiteFooter, SiteHeader } from '@/components/site-header'
import { Toaster } from '@/components/ui/sonner'

/** Router context shared by all routes. */
export interface RouterContext {
  queryClient: QueryClient
}

const Devtools = import.meta.env.DEV
  ? lazy(() => import('@/components/devtools'))
  : () => null

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: ({ error, reset }) => (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <ErrorState error={error} reset={reset} />
      </div>
    </div>
  ),
})

/** App shell: header, page outlet, footer and toasts. */
function RootLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <SiteFooter />
      <Toaster position="bottom-right" richColors />
      <Suspense>
        <Devtools />
      </Suspense>
    </div>
  )
}
