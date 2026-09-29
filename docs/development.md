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
