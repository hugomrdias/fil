import { createFileRoute } from '@tanstack/react-router'
import { apiCatalogResponse } from '@/lib/site/content.server'

export const Route = createFileRoute('/.well-known/api-catalog')({
  server: {
    handlers: {
      GET: ({ request }) => apiCatalogResponse(request),
      HEAD: ({ request }) => apiCatalogResponse(request),
    },
  },
})
