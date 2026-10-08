/**
 * Bundles the CLI with esbuild: one ESM entry with clipact, zod, and all
 * command definitions, plus one lazily loaded chunk per handler, so
 * `--help`, `--version`, and `schema` never load synapse-core or viem.
 * Also copies the agent skills from the fil plugin into `skills/`, which
 * `fil skills install` reads.
 *
 * @see ../../../docs/agent-cli/guidelines.md#startup-performance
 */
import { cp, rm } from 'node:fs/promises'
import { build } from 'esbuild'

// esbuild never deletes old hashed chunks, so start from an empty outdir.
await rm('dist', { recursive: true, force: true })

// The plugin's `skills/` directory is the only source; this copy is gitignored.
await rm('skills', { recursive: true, force: true })
await cp('../../plugins/fil/skills', 'skills', { recursive: true })

const result = await build({
  entryPoints: ['src/main.ts'],
  outdir: 'dist',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  chunkNames: 'chunks/[name]-[hash]',
  minify: true,
  sourcemap: true,
  metafile: true,
  logLevel: 'warning',
  // Some dependencies still call require() for Node built-ins.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
})

const outputs = Object.entries(result.metafile.outputs)
  .filter(([file]) => file.endsWith('.js'))
  .sort(([, a], [, b]) => b.bytes - a.bytes)
  .slice(0, 8)
  .map(
    ([file, output]) =>
      `${(output.bytes / 1024).toFixed(1).padStart(8)} KB  ${file}`
  )
process.stdout.write(`${outputs.join('\n')}\n`)
