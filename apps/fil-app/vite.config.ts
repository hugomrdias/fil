import { fileURLToPath, URL } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import { agentSkills } from '@hugomrdias/vite-plugin-agent-skills'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * TanStack Start on Cloudflare Workers. The Start plugin must come before
 * the React plugin. `agentSkills` publishes the fil plugin's `skills/`
 * directory for agent skills discovery.
 *
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/hosting
 */
export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    react(),
    tailwindcss(),
    agentSkills({
      dir: fileURLToPath(new URL('../../plugins/fil/skills', import.meta.url)),
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
