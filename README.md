# fil

`fil` stores files and folders on [Filecoin Onchain Cloud](https://docs.filecoin.cloud/) and returns Curio retrieval links. It is built for people and for agents: logging in does not require pasting keys, the same `put` command handles a file or a folder, results are structured with stable exit codes, and interrupted jobs can be resumed.

> **Status:** prototype. It stores one copy on one provider and runs on calibration by default.

```sh
fil login                     # approve a session key in the browser
fil status                    # scopes, funds, readiness
fil put ./report.pdf          # file   → https://<sp>/piece/<pieceCid>
fil put ./site                # folder → https://<sp>/ipfs/<rootCid>/
fil get res_… --output ./copy # download and verify
fil ls
fil delete res_… --yes
```

## Quick start

Requires Node.js 24+ and pnpm 11 (see [development](docs/development.md)).

```sh
pnpm install --frozen-lockfile
pnpm build
alias fil="node $PWD/packages/fil-cli/bin/fil.js"

fil login
fil status
fil put ./docs --json
```

1. **`fil login`** creates a session key on your machine and opens [pay.filecoin.cloud](https://pay.filecoin.cloud/console/session-keys) with the key filled in. Approve it with your wallet. The CLI detects the approval on chain, so there is nothing to copy back.
2. **`fil status`** shows whether your account has enough USDFC and Warm Storage approval. If it doesn't, it prints a prefilled console link to fund the account.
3. **`fil put`** uploads the file or folder, commits it on chain, and returns its reference (`res_…`), CIDs, and Curio URLs.

When an agent runs `fil`, every command writes one JSON object to stdout and exits `0` only when it succeeded; `login` returns the approval link as a `next` step for the user instead of waiting. `fil schema --list` describes every command offline, and `fil skills install` installs the bundled agent skill.

## How it works

- **Files** are stored as exact bytes (a raw piece) and verified by PieceCID on download.
- **Folders** are packed into a UnixFS CAR (IPIP-499 `unixfs-v1-2025`), stored in an IPFS-indexed data set, and served by Curio at `/ipfs/<rootCid>/`.
- **Signing** uses a session key authorized by your wallet. The provider submits the transactions, and your wallet pays for storage.
- **State** lives in a local SQLite database. Each `put` and `delete` is saved before it runs, so `fil operations resume <id>` can finish an interrupted job without committing it twice.

Read [the architecture](docs/architecture.md) for details.

## Repository

A pnpm and Turborepo monorepo; all packages are private.

| Directory | Package | Documentation |
| --- | --- | --- |
| `packages/fil-cli` | `fil-cli` | [Command reference](packages/fil-cli/README.md) |
| `packages/clipact` | `clipact` | [Framework for agent-friendly CLIs](packages/clipact/README.md) |
| `examples/launchpad` | `launchpad-example` | [Example clipact CLI with bundling](examples/launchpad/README.md) |

| Guide | Contents |
| --- | --- |
| [Architecture](docs/architecture.md) | Modules, login, put/get/rm flows, state, recovery, verification |
| [FOC CLI interface research](docs/foc-cli-interface-research.md) | FOC command surface, resources, operations, CLI state, and artifact delivery design |
| [CLI guidelines for agents](docs/agent-cli-guidelines.md) | Output, error, exit-code, discovery, and startup-performance conventions for agent-facing Node.js CLIs |
| [CLI framework design](docs/cli-framework-design.md) | Design of `clipact`, the framework that implements the agent CLI guidelines |
| [Development](docs/development.md) | Requirements, installation, validation |

Built with [synapse-core](https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-core), [clipact](packages/clipact/README.md), and [iso-conf](https://github.com/hugomrdias/iso-repo/tree/main/packages/iso-conf). The CAR packing follows [Filecoin Pin](https://github.com/filecoin-project/filecoin-pin).
