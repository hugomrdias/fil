# fil-cli

Prototype `fil` command-line interface for Filecoin Onchain Cloud. It stores a file or folder with one copy on one Curio provider and returns Curio retrieval URLs. It runs on the calibration network unless you choose mainnet. It uses [synapse-core](https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-core) directly, [clipact](../clipact/README.md) for the agent output contract, and [iso-conf](https://github.com/hugomrdias/iso-repo/tree/main/packages/iso-conf) for configuration. The design follows the [CLI interface research](../../docs/fil-cli/interface-research.md) and the [CLI guidelines for agents](../../docs/agent-cli/guidelines.md). The [architecture](../../docs/fil-cli/architecture.md) describes the modules and flows.

```sh
pnpm --filter fil-cli build
alias fil="node $PWD/packages/fil-cli/bin/fil.js"
fil --help
```

## Log in

```sh
fil login
```

`fil login` generates a session key and saves it locally. It then opens the pay.filecoin.cloud console, where the wallet owner approves the key. The CLI detects the approval on chain; there is nothing to copy back. By default it requests `createDataSet`, `addPieces`, and `schedulePieceRemovals`. Repeat `--scopes` to choose others. The session key signs each request, the provider submits the transactions, and the wallet pays for storage.

A human at a terminal gets the browser and a wait for approval. An agent, or any run without a terminal, never waits or opens a browser: it gets a `login_pending` error whose `next` steps are the approval link for the user and `fil login` for the agent to run once the user approves. An interrupted login resumes with the same key.

The session key cannot fund the account. `fil status` reports scope expiries, USDFC funds, and FWSS approval. When the account needs a deposit, it includes a prefilled console funding link. `fil doctor` shows the resolved network, RPC, console, and state directory with their sources, and checks the database and RPC.

For CI, set `FIL_SESSION_KEY` and `FIL_ROOT_ADDRESS` instead of logging in. The session key is a secret: it is read only from the environment and never printed.

## Store and retrieve

```sh
fil put ./report.pdf          # raw piece  → <serviceURL>/piece/<pieceCid>
fil put ./site                # UnixFS CAR → <serviceURL>/ipfs/<rootCid>/
fil put ./site --dry-run      # size, provider, cost, authorization; stores nothing
fil publish ./site            # alias of put
fil get res_… --output ./copy # verified by PieceCID; folders are extracted
fil ls
fil inspect res_… --check
fil delete res_… --yes        # alias rm; schedules removal, state removal_pending
```

Files are stored as exact bytes. Folders are packed into a UnixFS CAR with the IPIP-499 `unixfs-v1-2025` profile, the same way as [Filecoin Pin](https://github.com/filecoin-project/filecoin-pin). The CAR goes into a data set with `withIPFSIndexing`, so Curio serves it at `/ipfs/<rootCid>/`. Curio's `/ipfs` endpoint is a trustless gateway: it returns blocks and CARs, not rendered pages. Packing skips dotfiles and rejects symlinks. Content must be between 127 bytes and about 1 GiB.

`delete` is destructive: without `--yes` it asks a human at a terminal, and returns `confirmation_required` with a `by: "user"` step everywhere else, including for agents.

## Recovery

Each `put` and `delete` saves an operation before any external mutation, prints its ID to stderr right away, and records checkpoints as it goes. Errors from a put or delete carry a `fil operations resume <id>` step and are never `retryable`. Errors with a fil code also carry the ID in `error.details.operationId`; built-in codes such as `invalid_input` keep their own `details`: running the original command again would start a new paid operation.

```sh
fil operations ls --incomplete
fil operations inspect op_…
fil operations resume op_…
```

A resumed put never commits twice. The commit is signed with a fresh nonce and saved before it is sent; a resume first asks FWSS (`clientNonces`) whether that nonce landed, and otherwise resends the same signature, which FWSS accepts at most once. A resume also skips the upload when the provider already has the piece, refuses a source file that changed, and returns the saved outcome of a completed operation. A reverted removal leaves the resource active and can be resumed.

Ctrl+C or a harness's SIGTERM aborts the work at the next step and returns an `interrupted` result with the resume step, then exits with the signal (`130` or `143`).

## Output

`fil` follows the [clipact](../clipact/README.md) contract: in machine mode (`--json`, `FIL_OUTPUT=json`, a detected agent, or a non-terminal stdout) it writes one JSON object to stdout: `data` on success or `error` on failure, then optional `next` steps. Exit code `0` means the result has `data`; `1` means it has `error`. Diagnostics and progress go to stderr. `fil schema --list` and `fil schema <command>` describe every command and error code offline, `fil completion <shell>` prints shell completions, and `fil skills install` installs the bundled [agent skill](skills/fil/SKILL.md).

| Error code | Meaning |
| --- | --- |
| `auth_required`, `login_pending`, `session_expired`, `permission_denied` | Log in or approve scopes (a user step) |
| `insufficient_funds` | Fund the account at the console link (a user step) |
| `not_found`, `output_exists` | Wrong ref or ID; output path taken |
| `operation_failed`, `commit_rejected`, `removal_reverted`, `source_changed`, `staging_missing`, `operation_running` | A put or delete stopped; follow `next` |
| `verification_failed`, `unsafe_path` | Retrieved content did not verify |
| `invalid_input`, `confirmation_required`, `interrupted`, `internal_error`, `service_unavailable`, `timeout` | clipact built-ins |

## Configuration and state

| Variable | Purpose |
| --- | --- |
| `FIL_NETWORK` | `mainnet` or `calibration`; `--network` wins, then this, then the config file, then calibration |
| `FIL_SESSION_KEY`, `FIL_ROOT_ADDRESS` | Session key credentials without `login` |
| `FIL_CONFIG_DIR` | Config directory (default: platform config dir `fil`) |
| `FIL_STATE_DIR` | SQLite state and staging (default: platform data dir `fil`) |
| `FIL_RPC_URL` | RPC endpoint override |
| `FIL_CONSOLE_URL` | Console origin (default `https://pay.filecoin.cloud`) |
| `FIL_OUTPUT`, `FIL_AGENT` | clipact output mode and agent detection overrides |

The prototype keeps the session private key in the config file, readable only by its owner (mode 0600). `fil logout` removes the local key, but the key stays authorized on chain until you revoke it in the console.

## Development

`src/commands/` holds one definition per command (zod and clipact only), and `src/handlers/` the matching handler, loaded lazily so `--help`, `--version`, and `schema` never import synapse-core. `pnpm build` bundles both with esbuild into `dist/`, with one chunk per handler; `bin/fil.js` enables the compile cache and loads the bundle. Tests run the CLI in process with `clipact/testing` and spawn the built binary for the process contract (`test/contract.test.ts`).
