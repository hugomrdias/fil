# fil repository instructions

- Development: read the [root README](README.md#build-and-check) when setting up the local environment or running validation.

## Changes and validation

- Use Conventional Commits: `<type>(<optional scope>): <concise imperative description>`.
- Add a short JSDoc description for every new type, class, function, or method, with links to relevant references.
- After changes, run the TypeScript, Biome, and existing test checks through `pnpm check` (Turborepo). Run `pnpm build` when changing package exports or compilation settings.
- Test current code logic with the Node test runner.
