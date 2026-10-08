# CLI

`fil` stores a file or a folder as one copy on one storage provider and returns retrieval links. It runs on the calibration network unless you choose mainnet. It needs Node.js 24 or newer:

```sh
npm install -g @hugomrdias/fil
```

Or run it without installing, as `npx -y @hugomrdias/fil`.

This page explains how `fil` works. The CLI describes its own commands, which always match the installed version:

- `fil --help` lists the commands, and `fil <command> --help` shows examples and flags.
- `fil schema <command>` prints the command's input and output as JSON Schema, and what each error code means. `fil schema --list` lists every command with its side effects.

## Log in

```sh
fil login
```

`fil login` makes a session key and saves it on your machine. It then opens the [fil-app](https://fil-app.hugomrdias.dev) setup page with the key's address. The wallet owner reviews the request there and approves it with their wallet. The CLI finds the approval on chain, so there is nothing to copy back.

By default, `fil login` asks for the `createDataSet`, `addPieces`, and `schedulePieceRemovals` permissions for 30 days, under the name `fil-cli`. Repeat `--scopes` to ask for others. `--name` sets the name the owner sees, which is recorded on chain, and `--days` sets the expiry. The owner can change all three on the page before approving.

The session key signs each request, the provider submits the transactions, and the wallet pays for storage.

In a terminal, `fil login` opens the browser and waits for approval. An agent, or any run without a terminal, gets a `login_pending` error instead and never waits. The error's `next` steps are the approval link for the user and `fil login` for the agent to run after the user approves. An interrupted login resumes with the same key. Pass `--fresh` to make a new key.

For CI or a [cloud agent](/agents#cloud-agents), set `FIL_SESSION_KEY` and `FIL_ROOT_ADDRESS` instead of running `fil login`.

## Check the account

The session key cannot fund the account. `fil status` reports when each permission expires, the USDFC funds, and the Warm Storage approval. When the account needs a deposit, it also returns a prefilled funding link to the fil-app setup page.

`fil doctor` shows the network, RPC, fil-app and fil-api origins, and state directory that `fil` uses, with where each value came from.

## Store and retrieve

```sh
fil put ./report.pdf          # a file, stored as its exact bytes
fil put ./site                # a folder, packed into a UnixFS CAR
fil put ./site --dry-run      # size, provider, cost, and authorization; stores nothing
fil publish ./site            # same as put
fil get res_… --output ./copy # verifies the PieceCID and extracts folders
fil ls                        # add --all to include content pending removal
fil inspect res_… --check     # checks that the piece link answers
fil delete res_… --yes        # same as rm; schedules removal
```

`put` returns `urls.browser`, the link to share, and `urls.piece`, the exact stored bytes. [Retrieve and verify](/docs/retrieve) explains what each link and `fil get` check.

Packing skips dotfiles and rejects symlinks. The file, or the packed folder, must be between 127 bytes and 1,065,353,216 bytes (1016 MiB).

`delete` schedules removal, and the provider then deletes the stored copy. The content's state becomes `removal_pending`. Without `--yes`, `delete` asks a person at a terminal to confirm. Everyone else, including agents, gets `confirmation_required` with a step for the user.

## Resume an interrupted put or delete

```sh
fil operations ls --incomplete
fil operations inspect op_…
fil operations resume op_…
```

Each `put` and `delete` saves an operation before it changes anything, and prints its ID to stderr at once. An error from a put or a delete carries a `fil operations resume <id>` step. Run that step instead of the original command, which would start a new paid operation.

A resumed put never stores or pays twice:

- It skips the upload when the provider already has the piece.
- It checks on chain whether the commit landed before it sends it again.
- It fails with `source_changed` when the source file changed.
- It returns the saved result of an operation that already completed.

Ctrl+C stops the work at the next step and returns an `interrupted` result with the resume step.

## Output and errors

When an agent runs `fil`, or when you pass `--json` or redirect stdout, `fil` writes one JSON object to stdout: `data` on success or `error` on failure, then optional `next` steps. The exit code is `0` with `data` and `1` with `error`. Progress goes to stderr.

Each error has a stable `code`, and `fil schema <command>` lists the codes the command returns and what they mean. Errors that need a person, such as `login_pending` and `insufficient_funds`, carry a `next` step with a fil-app link for the user.

## Configuration

| Variable | Purpose |
| --- | --- |
| `FIL_NETWORK` | `mainnet` or `calibration`. `--network` wins, then `FIL_NETWORK`, then the config file, then `calibration` |
| `FIL_SESSION_KEY`, `FIL_ROOT_ADDRESS` | Session key and wallet address, used instead of `fil login` |
| `FIL_CONFIG_DIR` | Config directory. Default: the platform config directory for `fil` |
| `FIL_STATE_DIR` | Local state and staged folders. Default: the platform data directory for `fil` |
| `FIL_RPC_URL` | RPC endpoint |
| `FIL_CONSOLE_URL` | fil-app origin for approval and funding links. Default: `https://fil-app.hugomrdias.dev` |
| `FIL_API_URL` | fil-api origin for retrieval links. Default: `https://fil-api.hugomrdias.dev` |
| `FIL_OUTPUT`, `FIL_AGENT` | Override the output mode and agent detection |

The prototype saves the session key in the config file, readable only by its owner. `fil logout` deletes the local key. The key stays authorized on chain until it expires or you revoke it on the fil-app [session keys page](https://fil-app.hugomrdias.dev/dashboard/session-keys).
