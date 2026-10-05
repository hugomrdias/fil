# fil-cli

`fil` is a prototype command-line interface for Filecoin Onchain Cloud. It stores a file or a folder as one copy on one Curio provider and returns Curio retrieval URLs. It runs on the calibration network unless you choose mainnet.

`fil` calls [synapse-core](https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-core) directly. It uses [clipact](../clipact/README.md) for the agent output contract and [iso-conf](https://github.com/hugomrdias/iso-repo/tree/main/packages/iso-conf) for configuration. The design follows the [CLI interface research](../../docs/fil-cli/interface-research.md) and the [CLI guidelines for agents](../../docs/agent-cli/guidelines.md). The [architecture](../../docs/fil-cli/architecture.md) describes the modules and flows.

To build `fil` and put it on your path, run these commands from the repository root:

```sh
pnpm --filter fil-cli build
alias fil="node $PWD/packages/fil-cli/bin/fil.js"
fil --help
```

## Log in

```sh
fil login
```

`fil login` generates a session key and saves it locally. It then opens the [pay.filecoin.cloud](https://pay.filecoin.cloud) console, where the wallet owner approves the key. The CLI finds the approval on chain, so there is nothing to copy back. By default, it requests the `createDataSet`, `addPieces`, and `schedulePieceRemovals` scopes. To request other scopes, repeat `--scopes`.

The session key signs each request, the provider submits the transactions, and the wallet pays for storage.

In a terminal, `fil login` opens the browser and waits for approval. An agent, or any run without a terminal, gets a `login_pending` error instead and never waits. The error's `next` steps are the approval link for the user and `fil login` for the agent to run after the user approves. An interrupted login resumes with the same key. To generate a new key, pass `--fresh`.

For CI, set `FIL_SESSION_KEY` and `FIL_ROOT_ADDRESS` instead of running `fil login`. `fil` reads the session key only from the environment and never prints it.

## Check the account

The session key cannot fund the account. `fil status` reports the expiry of each scope, the USDFC funds, and the Warm Storage (FWSS) approval. When the account needs a deposit, `fil status` also returns a prefilled funding link to the console.

`fil doctor` shows the network, RPC, console, and state directory that `fil` resolved, with the source of each value. It also checks the database and the RPC.

## Store and retrieve

```sh
fil put ./report.pdf          # raw piece   → <serviceURL>/piece/<pieceCid>
fil put ./site                # UnixFS CAR  → <serviceURL>/ipfs/<rootCid>/
fil put ./site --dry-run      # size, provider, cost, and authorization; stores nothing
fil publish ./site            # alias of put
fil get res_… --output ./copy # verifies the PieceCID and extracts folders
fil ls                        # add --all to include resources pending removal
fil inspect res_… --check     # sends a HEAD request to the retrieval URL
fil delete res_… --yes        # alias rm; schedules removal
```

`fil` stores a file as its exact bytes. It packs a folder into a UnixFS CAR with the IPIP-499 `unixfs-v1-2025` profile, the same way as [Filecoin Pin](https://github.com/filecoin-project/filecoin-pin). The CAR goes into a data set with `withIPFSIndexing`, so Curio serves it at `/ipfs/<rootCid>/`. Curio's `/ipfs` endpoint is a trustless gateway. It returns blocks and CARs, not rendered pages.

Packing skips dotfiles and rejects symlinks. The file or the packed CAR must be between 127 and 1,065,353,216 bytes (1016 MiB).

`delete` schedules removal, and the provider then deletes the stored copy. The resource state becomes `removal_pending`. Without `--yes`, `delete` asks a human at a terminal to confirm. In every other case, including for agents, it returns `confirmation_required` with a step for the user (`by: "user"`).

## Resume an interrupted put or delete

```sh
fil operations ls --incomplete
fil operations inspect op_…
fil operations resume op_…
```

Each `put` and `delete` saves an operation in the local SQLite database before it changes anything on chain or at the provider. It prints the operation ID to stderr at once, so the ID survives even a SIGKILL. It then saves a checkpoint after each step.

An error from a put or delete carries a `fil operations resume <id>` step and is never `retryable`. Running the original command again would start a new paid operation. Errors with a `fil` code also carry the ID in `error.details.operationId`. clipact's built-in codes, such as `invalid_input`, keep their own `details`.

A resumed put never commits twice. `fil` signs the commit with a fresh nonce and saves it before sending it. A resume first asks FWSS (`clientNonces`) whether that nonce landed. If it did not, the resume sends the same signature again, and FWSS accepts it at most once.

A resume also does the following:

- Skips the upload when the provider already has the piece.
- Fails with `source_changed` when the source file changed.
- Returns the saved result of an operation that already completed.

If a removal transaction reverts, the resource stays active and you can resume the delete.

Ctrl+C, SIGTERM, or SIGHUP stops the work at the next step. `fil` returns an `interrupted` result with the resume step, then re-raises the signal, so the shell sees `130`, `143`, or `129`.

## Output and errors

`fil` follows the [clipact](../clipact/README.md) output contract. It uses machine mode when you pass `--json`, set `FIL_OUTPUT=json`, run it from a detected agent, or redirect stdout away from a terminal. In machine mode, it writes one JSON object to stdout, with `data` on success or `error` on failure, then optional `next` steps. The exit code is `0` when the result has `data` and `1` when it has `error`. Diagnostics and progress go to stderr in every mode.

| Command | Prints |
| --- | --- |
| `fil schema --list` | Every command, offline |
| `fil schema <command>` | The command's input and output as JSON Schema, and its error codes |
| `fil completion <shell>` | A completion script for `bash`, `zsh`, or `fish` |
| `fil skills install` | Installs the bundled [agent skill](skills/fil/SKILL.md) |

| Error code | Meaning |
| --- | --- |
| `auth_required`, `login_pending`, `session_expired`, `permission_denied` | The user must log in or approve scopes |
| `insufficient_funds` | The user must fund the account at the console link |
| `not_found` | No resource, operation, provider, or piece has that name |
| `output_exists` | The `fil get` output path exists. Pass `--force` to overwrite it |
| `operation_failed`, `commit_rejected`, `removal_reverted`, `source_changed`, `staging_missing`, `operation_running` | A put or delete stopped. Follow the `next` steps |
| `verification_failed` | Retrieved bytes or blocks do not match their CIDs |
| `unsafe_path` | A retrieved archive tried to write outside the output directory |
| `invalid_input`, `confirmation_required`, `interrupted`, `internal_error`, `service_unavailable`, `timeout` | Built into clipact. See [clipact errors](../clipact/README.md#errors) |

## Configuration and state

| Variable | Purpose |
| --- | --- |
| `FIL_NETWORK` | `mainnet` or `calibration`. `--network` takes precedence, then `FIL_NETWORK`, then the config file, then `calibration` |
| `FIL_SESSION_KEY`, `FIL_ROOT_ADDRESS` | Session key and wallet address, used instead of `fil login` |
| `FIL_CONFIG_DIR` | Config directory. Default: the platform config directory for `fil` |
| `FIL_STATE_DIR` | SQLite state and staged CARs. Default: the platform data directory for `fil` |
| `FIL_RPC_URL` | RPC endpoint. Default: synapse-core's fallback transport for the chain |
| `FIL_CONSOLE_URL` | Console origin. Default: `https://pay.filecoin.cloud` |
| `FIL_OUTPUT`, `FIL_AGENT` | Override clipact's output mode and agent detection |

The prototype saves the session private key in the config file with mode 0600, so only its owner can read it. `fil logout` deletes the local key. The key stays authorized on chain until you revoke it in the console.

## Development

Each command has a definition in `src/commands/` and a handler in `src/handlers/`. Definitions import only zod and clipact. clipact loads a handler only when its command runs, so `--help`, `--version`, and `schema` never import synapse-core.

`pnpm build` bundles the CLI with esbuild into `dist/`, with one chunk per handler. `bin/fil.js` turns on Node's compile cache, then loads the bundle.

Most tests run the CLI in process with `clipact/testing`. `test/contract.test.ts` spawns the built `bin/fil.js` to test stdout, exit codes, and signals on a real process.
