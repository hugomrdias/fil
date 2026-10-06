import { createFileRoute } from '@tanstack/react-router'
import { llmsResponse } from '@/lib/site/content.server'

export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: ({ request }) => llmsResponse(request, true),
    },
  },
})
