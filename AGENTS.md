# fil repository instructions

<!-- intent-skills:start -->
## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:
- Run `pnpm exec intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm exec intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

- Cloudflare Workers: `apps/fil-api` and `apps/fil-app` deploy to Workers, and Intent does not list Cloudflare's skills. Before changing either app's server code, its `wrangler.jsonc`, or a Cloudflare resource such as a Hyperdrive config, load the `cloudflare:workers-best-practices` and `cloudflare:wrangler` skills.
- Development: read the [root README](README.md#build-and-check) when setting up the local environment or running validation.

## Changes and validation

- Use Conventional Commits: `<type>(<optional scope>): <concise imperative description>`.
- Add a short JSDoc description for every new type, class, function, or method, with links to relevant references.
- After changes, run the TypeScript, Biome, and existing test checks through `pnpm check` (Turborepo). Run `pnpm build` when changing package exports or compilation settings.

## Documentation

- Keep [docs/fil/README.md](docs/fil/README.md) and [docs/fil/architecture.md](docs/fil/architecture.md) current in the same change as the code, including the open questions a change answers and the follow-ups it completes.
- When code and these docs disagree, list each inconsistency for the user and let them decide which side is right before you edit either.
