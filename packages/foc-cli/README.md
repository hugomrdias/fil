# foc-cli

Prototype `foc` command-line interface for Filecoin Onchain Cloud. It stores a file or folder with one copy on one Curio provider and returns Curio retrieval URLs. It uses [synapse-core](https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-core) directly, [clipact](../clipact/README.md) for the agent output contract, and [iso-conf](https://github.com/hugomrdias/iso-repo/tree/main/packages/iso-conf) for configuration. The design follows the [CLI interface research](../../docs/foc-cli-interface-research.md) and the [CLI guidelines for agents](../../docs/agent-cli-guidelines.md).

```sh
pnpm --filter foc-cli build
node packages/foc-cli/bin/foc.js --help
```

## Log in

```sh
foc login
```

`foc login` generates a session key and saves it locally. It then opens the pay.filecoin.cloud console, where the wallet owner approves the key. The CLI detects the approval on chain; there is nothing to copy back. By default it requests `createDataSet`, `addPieces`, and `schedulePieceRemovals`; repeat `--scopes` to choose others.

A human at a terminal gets the browser and a wait for approval. An agent, or any run without a terminal, never waits or opens a browser: it gets a `login_pending` error whose `next` steps are the approval link for the user and `foc login` for the agent to run once the user approves. An interrupted login resumes with the same key.

The session key cannot fund the account. `foc status` reports scope expiries, USDFC funds, and FWSS approval. When the account needs a deposit, it includes a prefilled console funding link. `foc doctor` shows the resolved network, RPC, console, and state directory with their sources, and checks the database and RPC.

For CI, set `FOC_SESSION_KEY` and `FOC_ROOT_ADDRESS` instead of logging in. The session key is a secret: it is read only from the environment and never printed.

## Store and retrieve

```sh
foc put ./report.pdf          # raw piece  → <serviceURL>/piece/<pieceCid>
foc put ./site                # UnixFS CAR → <serviceURL>/ipfs/<rootCid>/
foc put ./site --dry-run      # size, provider, cost, authorization; stores nothing
foc publish ./site            # alias of put
foc get res_… --output ./copy # verified by PieceCID; folders are extracted
foc ls
foc inspect res_… --check
foc delete res_… --yes        # alias rm; schedules removal, state removal_pending
```

Files are stored as exact bytes. Folders are packed with the IPIP-499 `unixfs-v1-2025` profile into a data set with `withIPFSIndexing`, so Curio serves them at `/ipfs/<rootCid>/`. Curio's `/ipfs` endpoint is a trustless gateway: it returns blocks and CARs, not rendered pages. Packing skips dotfiles and rejects symlinks. Content must be between 127 bytes and about 1 GiB.

`delete` is destructive: without `--yes` it asks a human at a terminal, and returns `confirmation_required` with a `by: "user"` step everywhere else, including for agents.

## Recovery

Each `put` and `delete` saves an operation before any external mutation, prints its ID to stderr right away, and records checkpoints as it goes. Errors from a put or delete carry `operationId` and a `foc operations resume <id>` step, and are never `retryable`: running the original command again would start a new paid operation.

```sh
foc operations ls --incomplete
foc operations inspect op_…
foc operations resume op_…
```

A resumed put never commits twice. The commit is signed with a fresh nonce and saved before it is sent; a resume first asks FWSS (`clientNonces`) whether that nonce landed, and otherwise resends the same signature, which FWSS accepts at most once. A resume also skips the upload when the provider already has the piece, refuses a source file that changed, and returns the saved outcome of a completed operation. A reverted removal leaves the resource active and can be resumed.

Ctrl+C or a harness's SIGTERM aborts the work at the next step and returns an `interrupted` result with the resume step, then exits with the signal (`130` or `143`).

## Output

`foc` follows the [clipact](../clipact/README.md) contract: in machine mode (`--json`, `FOC_OUTPUT=json`, a detected agent, or a non-terminal stdout) it writes one JSON object to stdout, with `ok`, command fields, and `error` and `next` on failure. Exit code `0` means `ok: true`; everything else exits `1`. Diagnostics and progress go to stderr. `foc schema --list` and `foc schema <command>` describe every command offline, `foc completion <shell>` prints shell completions, and `foc skills install` installs the bundled [agent skill](skills/foc/SKILL.md).

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
| `FOC_NETWORK` | `mainnet` or `calibration`; `--network` wins, then this, then the config file, then calibration |
| `FOC_SESSION_KEY`, `FOC_ROOT_ADDRESS` | Session key credentials without `login` |
| `FOC_CONFIG_DIR` | Config directory (default: platform config dir `foc`) |
| `FOC_STATE_DIR` | SQLite state and staging (default: platform data dir `foc`) |
| `FOC_RPC_URL` | RPC endpoint override |
| `FOC_CONSOLE_URL` | Console origin (default `https://pay.filecoin.cloud`) |
| `FOC_OUTPUT`, `FOC_AGENT` | clipact output mode and agent detection overrides |

The prototype keeps the session private key in the config file, readable only by its owner (mode 0600). `foc logout` removes the local key, but the key stays authorized on chain until you revoke it in the console.

## Development

`src/commands/` holds one definition per command (zod and clipact only), and `src/handlers/` the matching handler, loaded lazily so `--help`, `--version`, and `schema` never import synapse-core. `pnpm build` bundles both with esbuild into `dist/`, with one chunk per handler; `bin/foc.js` enables the compile cache and loads the bundle. Tests run the CLI in process with `clipact/testing` and spawn the built binary for the process contract (`test/contract.test.ts`).
