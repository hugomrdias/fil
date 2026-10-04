import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'
import { NETWORKS } from './src/networks.ts'

// Tests inject a fake database; wrangler only needs a value per binding.
for (const { binding } of Object.values(NETWORKS)) {
  process.env[`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_${binding}`] ??=
    'postgresql://test:test@127.0.0.1:5432/test'
}

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: { silent: 'passed-only' },
})
