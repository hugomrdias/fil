# fil

Tools for [Filecoin](https://docs.filecoin.cloud/). This repository holds the `fil` command-line interface, a read-only API with an MCP server, a web explorer and wallet dashboard, and `clipact`, the CLI framework that `fil` uses. It is a pnpm and Turborepo monorepo. The packages publish to npm, and the apps stay private.

## Packages and apps

| Directory | npm | Contents |
| --- | --- | --- |
| [`packages/fil-cli`](packages/fil-cli/README.md) | `@hugomrdias/fil` | `fil`, a prototype CLI that stores files and folders on one Curio provider and returns retrieval URLs. People and agents both run it. |
| [`packages/vite-plugin-agent-skills`](packages/vite-plugin-agent-skills/README.md) | `@hugomrdias/vite-plugin-agent-skills` | A Vite plugin that publishes Agent Skills under `/.well-known/agent-skills/` for agent skills discovery. fil-app uses it. |
| [`packages/clipact`](packages/clipact/README.md) | `clipact` | A framework for Node.js CLIs that agents run. Each command writes one JSON result with stable error codes and `next` steps. |
| [`apps/fil-api`](apps/fil-api/README.md) | Private | A Cloudflare Worker that serves a REST API and an MCP server for providers, data sets, pieces, Filecoin Pay rails, and session keys. |
| [`apps/fil-app`](apps/fil-app/README.md) | Private | A React explorer for fil-api data, and a wallet dashboard for Filecoin Pay, Warm Storage approval, data sets, and session keys. |
| [`examples/launchpad`](examples/launchpad/README.md) | Private | A complete clipact CLI that deploys sites to a mock host, with an esbuild bundle. |
| [`skills`](skills) | | The agent skills the repository publishes. `fil skills install`, fil-app's `/.well-known/agent-skills/`, and `npx skills add hugomrdias/fil` all read this directory. |

## Documentation

| Document | Contents |
| --- | --- |
| [fil overview](docs/fil/README.md) | The CLI, REST API, MCP server, and app, with the assumptions, compromises, open questions, and follow-up work of the proof of concept |
| [fil architecture](docs/fil/architecture.md) | Modules, login, put, get, and delete flows, state, recovery, and verification |
| [fil interface research](docs/fil/interface-research.md) | The historical design research behind the CLI: commands, resources, operations, and local state |
| [Agent-facing CLIs](docs/agent-cli/README.md) | Guidelines for Node.js CLIs that agents run, and the design of clipact |

## Build and check

Use Node.js 24 or newer and pnpm 11.24.0, which provisions the configured Node.js 24 runtime. Run commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check
```

`pnpm check` runs TypeScript, tests, and Biome in every workspace through Turborepo, then lints the root configuration and checks the published agent skills. `pnpm check:fix` applies Biome fixes. Each app's README covers its own development commands.

## Release

[release-please](https://github.com/googleapis/release-please) versions the three packages and the two apps from [Conventional Commits](https://www.conventionalcommits.org/). [`.github/release-please-config.json`](.github/release-please-config.json) lists them, and [`.github/.release-please-manifest.json`](.github/.release-please-manifest.json) holds their current versions. The examples are not released.

1. On each push to `main`, the [Release workflow](.github/workflows/release.yml) opens or updates one release pull request. It bumps the version and updates `CHANGELOG.md` of every package or app that a commit touched since its last release. Below 1.0.0, `feat` bumps the minor version and `fix` the patch version.
2. Merging the release pull request tags each release as `<component>-v<version>`, such as `fil-cli-v0.1.0`, and creates its GitHub release.
3. The same workflow then publishes each released package with `pnpm publish`, which replaces `workspace:` and `catalog:` specifiers, and adds provenance. The apps get a version, a changelog, and a GitHub release, but are never published. Their own workflows deploy them.

The workflow publishes through [npm trusted publishing](https://docs.npmjs.com/trusted-publishers), so the repository holds no npm token. Each package needs a trusted publisher on npmjs.com for the `hugomrdias/fil` repository and the `release.yml` workflow. The publish job runs in the `npm` GitHub environment, which GitHub creates on the first run. Naming `npm` as the trusted publisher's optional environment limits publishing to that job, and the environment's protection rules can later require a reviewer or the `main` branch. npm configures it only for a package that exists, so publish each package once by hand before its first release. Pull requests that `GITHUB_TOKEN` opens do not trigger CI, so set a `RELEASE_PLEASE_TOKEN` secret with a token that can open pull requests to run CI on the release pull request.
