import { createFileRoute } from '@tanstack/react-router'
import { agentSkillsResponse } from '@/lib/site/content.server'

export const Route = createFileRoute('/.well-known/agent-skills/index.json')({
  server: {
    handlers: {
      GET: () => agentSkillsResponse(),
    },
  },
})
