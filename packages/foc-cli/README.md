# foc-cli

Prototype `foc` command-line interface for Filecoin Onchain Cloud. It stores a file or folder with one copy on one Curio provider and returns Curio retrieval URLs. It uses [synapse-core](https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-core) directly, [incur](https://github.com/wevm/incur) for the command contract, and [iso-conf](https://github.com/hugomrdias/iso-repo/tree/main/packages/iso-conf) for configuration. The design follows the [CLI interface research](../../docs/foc-cli-interface-research.md).

```sh
pnpm --filter foc-cli build
node packages/foc-cli/dist/index.js --help
```

## Log in

```sh
foc login
```

`foc login` generates a session key and saves it locally. It then opens the pay.filecoin.cloud console, where the wallet owner approves the key. The CLI detects the approval on chain; there is nothing to copy back. By default it requests `createDataSet`, `addPieces`, and `schedulePieceRemovals`. Use `--scopes` to change them.

In a terminal, `login` opens the browser and waits for approval. When an agent or pipe runs it, `login` returns `LOGIN_PENDING` immediately (exit code 7) with the approval URL. Run `foc login` again after the owner approves it. An interrupted login resumes with the same key.

The session key cannot fund the account. `foc status` reports scope expiries, USDFC funds, and FWSS approval. When the account needs a deposit, it includes a prefilled console funding link.

For CI, set `FOC_SESSION_KEY` and `FOC_ROOT_ADDRESS` instead of logging in.

## Store and retrieve

```sh
foc put ./report.pdf          # raw piece  → <serviceURL>/piece/<pieceCid>
foc put ./site                # UnixFS CAR → <serviceURL>/ipfs/<rootCid>/
foc publish ./site            # alias of put
foc get res_… -o ./copy       # verified by PieceCID; folders are extracted
foc ls
foc inspect res_… --check
foc rm res_…                  # schedules removal; state is removal_pending
```

Files are stored as exact bytes. Folders are packed with the IPIP-499 `unixfs-v1-2025` profile into a data set with `withIPFSIndexing`, so Curio serves them at `/ipfs/<rootCid>/`. Curio's `/ipfs` endpoint is a trustless gateway: it returns blocks and CARs, not rendered pages. Packing skips dotfiles and rejects symlinks. Content must be between 127 bytes and about 1 GiB.

## Recovery

Each `put` and `rm` saves an operation before any external mutation and records checkpoints as it goes. If a job is interrupted, list and resume it:

```sh
foc ops ls --incomplete
foc ops inspect op_…
foc ops resume op_…
```

When a job resumes, it waits on a saved provider submission instead of submitting it again. It also skips the upload when the provider already has the piece, and it refuses to continue if the source file has changed.

## Output and exit codes

Every command supports `--json`, `--format`, `--schema`, `--llms`, and `--mcp` through incur. Progress messages go to stderr, and only when running in a terminal.

| Exit | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Unexpected failure |
| 2 | Invalid input |
| 3 | Authorization or funding required |
| 4 | Not found |
| 5 | Transient failure |
| 7 | Pending |

## Configuration and state

| Variable | Purpose |
| --- | --- |
| `FOC_NETWORK` | `mainnet` or `calibration` (default `calibration`; `--network` wins) |
| `FOC_CONFIG_DIR` | Config directory (default: platform config dir `foc`) |
| `FOC_STATE_DIR` | SQLite state and staging (default: platform data dir `foc`) |
| `FOC_RPC_URL` | RPC endpoint override |
| `FOC_CONSOLE_URL` | Console origin (default `https://pay.filecoin.cloud`) |
| `FOC_SESSION_KEY`, `FOC_ROOT_ADDRESS` | Session key credentials without `login` |

The prototype keeps the session private key in the config file, readable only by its owner (mode 0600). `foc logout` removes the local key, but the key stays authorized on chain until you revoke it in the console.
