import { createFileRoute } from '@tanstack/react-router'
import { serverCardResponse } from '@/lib/site/content.server'

/** The SEP-2127 path for a single MCP server card. */
export const Route = createFileRoute('/.well-known/mcp-server-card')({
  server: {
    handlers: {
      GET: ({ request }) => serverCardResponse(request),
    },
  },
})
