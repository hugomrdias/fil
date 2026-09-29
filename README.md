# foc

`foc` stores files and folders on [Filecoin Onchain Cloud](https://docs.filecoin.cloud/) and returns Curio retrieval links. It is built for people and for agents: logging in does not require pasting keys, the same `put` command handles a file or a folder, results are structured with stable exit codes, and interrupted jobs can be resumed.

> **Status:** prototype. It stores one copy on one provider and runs on calibration by default.

```sh
foc login                     # approve a session key in the browser
foc status                    # scopes, funds, readiness
foc put ./report.pdf          # file   → https://<sp>/piece/<pieceCid>
foc put ./site                # folder → https://<sp>/ipfs/<rootCid>/
foc get res_… -o ./copy       # download and verify
foc ls
foc rm res_…
```

## Quick start

Requires Node.js 24+ and pnpm 11 (see [development](docs/development.md)).

```sh
pnpm install --frozen-lockfile
pnpm build
alias foc="node $PWD/packages/foc-cli/dist/index.js"

foc login
foc status
foc put ./docs --json
```

1. **`foc login`** creates a session key on your machine and opens [pay.filecoin.cloud](https://pay.filecoin.cloud/console/session-keys) with the key filled in. Approve it with your wallet. The CLI detects the approval on chain, so there is nothing to copy back.
2. **`foc status`** shows whether your account has enough USDFC and Warm Storage approval. If it doesn't, it prints a prefilled console link to fund the account.
3. **`foc put`** uploads the file or folder, commits it on chain, and returns its reference (`res_…`), CIDs, and Curio URLs.

When an agent runs `foc` (non-TTY), `login` returns the approval URL immediately with exit code 7 instead of waiting. Every command accepts `--json`. `foc --llms` prints a manifest of commands for LLMs, and `foc --mcp` runs the CLI as an MCP server.

## How it works

- **Files** are stored as exact bytes (a raw piece) and verified by PieceCID on download.
- **Folders** are packed into a UnixFS CAR (IPIP-499 `unixfs-v1-2025`), stored in an IPFS-indexed data set, and served by Curio at `/ipfs/<rootCid>/`.
- **Signing** uses a session key authorized by your wallet. The provider submits the transactions, and your wallet pays for storage.
- **State** lives in a local SQLite database. Each `put` and `rm` is saved before it runs, so `foc ops resume <id>` can finish an interrupted job without submitting it twice.

Read [the architecture](docs/architecture.md) for details.

## Repository

A pnpm and Turborepo monorepo; all packages are private.

| Directory | Package | Documentation |
| --- | --- | --- |
| `packages/foc-cli` | `foc-cli` | [Command reference](packages/foc-cli/README.md) |
| `packages/clipact` | `clipact` | [Framework for agent-friendly CLIs](packages/clipact/README.md) |
| `examples/launchpad` | `launchpad-example` | [Example clipact CLI with bundling](examples/launchpad/README.md) |

| Guide | Contents |
| --- | --- |
| [Architecture](docs/architecture.md) | Modules, login, put/get/rm flows, state, recovery, verification |
| [FOC CLI interface research](docs/foc-cli-interface-research.md) | FOC command surface, resources, operations, CLI state, and artifact delivery design |
| [CLI guidelines for agents](docs/agent-cli-guidelines.md) | Output, error, exit-code, discovery, and startup-performance conventions for agent-facing Node.js CLIs |
| [CLI framework design](docs/cli-framework-design.md) | Design of `clipact`, the framework that implements the agent CLI guidelines |
| [Development](docs/development.md) | Requirements, installation, validation |

Built with [synapse-core](https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-core), [incur](https://github.com/wevm/incur), and [iso-conf](https://github.com/hugomrdias/iso-repo/tree/main/packages/iso-conf). The CAR packing follows [Filecoin Pin](https://github.com/filecoin-project/filecoin-pin).
