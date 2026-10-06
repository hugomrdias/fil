import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { NotFound } from '@/components/empty-state'
import { ApiError } from '@/lib/api/client'
import { routeTree } from './routeTree.gen'

/**
 * Create the app router with a fresh query client in context. TanStack Start
 * calls this once per server request and once in the browser, so requests
 * never share cached data.
 *
 * The SSR query integration sends the queries fetched during server rendering
 * to the browser, and wraps the app in a `QueryClientProvider`.
 *
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/routing
 * @see https://tanstack.com/router/latest/docs/integrations/query
 */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) =>
          !(error instanceof ApiError && error.status < 500) && count < 2,
        refetchOnWindowFocus: false,
      },
    },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
    // Every search param is a flat string; the default JSON parsing would turn
    // `?q=5` into a number and `?active=true` into a boolean.
    parseSearch: (search) => Object.fromEntries(new URLSearchParams(search)),
    stringifySearch: (search) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(search)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value))
        }
      }
      const text = params.toString()
      return text ? `?${text}` : ''
    },
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  /** Register the router for type inference. */
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
