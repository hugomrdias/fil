import { createFileRoute } from '@tanstack/react-router'
import { sitemapResponse } from '@/lib/site/content.server'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: ({ request }) => sitemapResponse(request),
    },
  },
})
