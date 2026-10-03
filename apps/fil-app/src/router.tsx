import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { NotFound } from '@/components/empty-state'
import { ApiError } from '@/lib/api/client'
import { routeTree } from './routeTree.gen'

/** Shared TanStack Query client. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) =>
        !(error instanceof ApiError && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * App router with the query client in context.
 *
 * @see https://tanstack.com/router/latest/docs/framework/react/guide/router-context
 */
export const router = createRouter({
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

declare module '@tanstack/react-router' {
  /** Register the router for type inference. */
  interface Register {
    router: typeof router
  }
}
