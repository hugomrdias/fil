import { createFileRoute } from '@tanstack/react-router'
import { robotsResponse } from '@/lib/site/content.server'

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: ({ request }) => robotsResponse(request),
    },
  },
})
