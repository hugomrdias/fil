import { createFileRoute } from '@tanstack/react-router'
import { integrationsResponse } from '@/lib/site/content.server'

/** The owner declaration that integrations.sh reads. */
export const Route = createFileRoute('/.well-known/integrations.json')({
  server: {
    handlers: {
      GET: ({ request }) => integrationsResponse(request),
      HEAD: ({ request }) => integrationsResponse(request),
    },
  },
})
