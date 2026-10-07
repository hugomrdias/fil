# fil

Tools for [Filecoin](https://docs.filecoin.cloud/). This repository holds the `fil` command-line interface, a read-only API with an MCP server, a web explorer and wallet dashboard, and `clipact`, the CLI framework that `fil` uses. It is a pnpm and Turborepo monorepo, and every package is private.

## Packages and apps

| Directory | Contents |
| --- | --- |
| [`packages/fil-cli`](packages/fil-cli/README.md) | `fil`, a prototype CLI that stores files and folders on one Curio provider and returns retrieval URLs. People and agents both run it. |
| [`packages/clipact`](packages/clipact/README.md) | A framework for Node.js CLIs that agents run. Each command writes one JSON result with stable error codes and `next` steps. |
| [`apps/fil-api`](apps/fil-api/README.md) | A Cloudflare Worker that serves a REST API and an MCP server for providers, data sets, pieces, Filecoin Pay rails, and session keys. |
| [`apps/fil-app`](apps/fil-app/README.md) | A React explorer for fil-api data, and a wallet dashboard for Filecoin Pay, Warm Storage approval, data sets, and session keys. |
| [`examples/launchpad`](examples/launchpad/README.md) | A complete clipact CLI that deploys sites to a mock host, with an esbuild bundle. |

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

`pnpm check` runs TypeScript, tests, and Biome in every workspace through Turborepo, then lints the root configuration. `pnpm check:fix` applies Biome fixes. Each app's README covers its own development commands.
