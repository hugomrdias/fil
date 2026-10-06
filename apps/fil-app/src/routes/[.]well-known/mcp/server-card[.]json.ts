import { createFileRoute } from '@tanstack/react-router'
import { serverCardResponse } from '@/lib/site/content.server'

/** The path that MCP clients check today, ahead of SEP-2127. */
export const Route = createFileRoute('/.well-known/mcp/server-card.json')({
  server: {
    handlers: {
      GET: ({ request }) => serverCardResponse(request),
    },
  },
})
