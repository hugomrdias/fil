# fil repository instructions

- Development: read the [root README](README.md#build-and-check) when setting up the local environment or running validation.

## Changes and validation

- Use Conventional Commits: `<type>(<optional scope>): <concise imperative description>`.
- Add a short JSDoc description for every new type, class, function, or method, with links to relevant references.
- After changes, run the TypeScript, Biome, and existing test checks through `pnpm check` (Turborepo). Run `pnpm build` when changing package exports or compilation settings.

## Documentation

- Keep [docs/fil/README.md](docs/fil/README.md) and [docs/fil/architecture.md](docs/fil/architecture.md) current in the same change as the code, including the open questions a change answers and the follow-ups it completes.
- When code and these docs disagree, list each inconsistency for the user and let them decide which side is right before you edit either.
