# Local development

Run commands from the **repository root**.

## Requirements and installation

Use Node.js 24 or newer and pnpm 11.24.0; pnpm provisions the configured Node.js 24 runtime. Install the locked dependencies:

```sh
pnpm install --frozen-lockfile
```

## Validation

```sh
pnpm build
pnpm check
```

`pnpm check` runs TypeScript, tests, and Biome in every workspace through Turborepo, then lints the root configuration. Use `pnpm check:fix` to apply Biome fixes.

## Apps

- `apps/fil-api`: Cloudflare Worker REST API and MCP server. See [its README](../apps/fil-api/README.md).
- `apps/fil-app`: Vite + React explorer and wallet dashboard on top of fil-api. Run `pnpm --filter fil-app dev`; after fil-api changes its routes or schemas, run `pnpm --filter fil-app gen:api` to regenerate the typed client. See [its README](../apps/fil-app/README.md).
