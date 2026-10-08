import { createFileRoute } from '@tanstack/react-router'
import { skillResponse } from '@/lib/site/content.server'

export const Route = createFileRoute(
  '/.well-known/agent-skills/$name/SKILL.md'
)({
  server: {
    handlers: {
      GET: ({ params }) => skillResponse(params.name),
    },
  },
})
