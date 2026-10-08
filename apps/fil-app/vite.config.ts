import { fileURLToPath, URL } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { agentSkills } from 'vite-plugin-agent-skills'

/**
 * TanStack Start on Cloudflare Workers. The Start plugin must come before
 * the React plugin. `agentSkills` publishes the repository's root `skills/`
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
      dir: fileURLToPath(new URL('../../skills', import.meta.url)),
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
