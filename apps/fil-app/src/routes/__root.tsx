import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import { CommandMenuProvider } from '@/components/command-menu'
import { ErrorState, NotFound } from '@/components/empty-state'
import { ExplorerShell } from '@/components/site-header'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WebMcpReadTools } from '@/components/webmcp-read-tools'
import { WebMcpTools } from '@/components/webmcp-tools'
import { wagmiConfig } from '@/config/wagmi'
import { THEME_SCRIPT } from '@/lib/theme'
import stylesUrl from '../styles.css?url'

/** Router context shared by all routes. */
export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      {
        name: 'description',
        content:
          'Explore Filecoin Onchain Cloud storage and payments, and manage your data sets, rails and session keys.',
      },
      { title: 'fil-app · Filecoin Onchain Cloud' },
    ],
    links: [
      { rel: 'stylesheet', href: stylesUrl },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
    scripts: [{ children: THEME_SCRIPT }],
  }),
  shellComponent: RootDocument,
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
 * HTML document for every page, with the providers that error and not-found
 * pages also need. The server renders the dark theme; `THEME_SCRIPT` applies
 * the stored theme before the first paint.
 *
 * @param props.children - The matched route, or its error or not-found page.
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/routing#the-root-route
 */
function RootDocument(props: { children: ReactNode }) {
  return (
    <html className="dark" lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <WagmiProvider config={wagmiConfig}>
          <TooltipProvider>{props.children}</TooltipProvider>
        </WagmiProvider>
        <Scripts />
      </body>
    </html>
  )
}

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
