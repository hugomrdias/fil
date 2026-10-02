---
name: foc
description: Store files and folders on Filecoin Onchain Cloud with the foc CLI and return Curio retrieval links; download, list, delete, and resume interrupted uploads. Use when the user asks to publish, store, share, or retrieve content on Filecoin or FOC.
---

# foc

`foc` stores a file (exact bytes) or a folder (a UnixFS CAR served over IPFS) on Filecoin Onchain Cloud and returns a link. Every command writes one JSON object to stdout when run by an agent; branch on `ok` and `error.code`, never on stderr text.

## Discover before you call

- `foc schema --list` lists every command with its side effects.
- `foc schema <command>` gives the input and output JSON Schemas and error codes for the installed version. Prefer it over guessing flags.

## Workflow

1. `foc status` shows whether a session key is active and the account is funded.
2. `foc put <path> --dry-run` shows the size, provider, cost, and any missing authorization without storing anything.
3. `foc put <path>` (or `foc publish <path>`) stores it. Return `urls.ipfs` for a folder or `urls.piece` for a file to the user exactly as given, with `resource.ref`.
4. `foc get <ref>` downloads and verifies content; `foc ls` and `foc inspect <ref>` find what was stored.

## Rules

- Never ask for or pass a private key. Logging in needs the user: `auth_required` or `login_pending` means relay the `by: "user"` step (the console link) and stop. After the user approves, run `foc login` once to confirm.
- `insufficient_funds` and `session_expired` also need the user; relay their `next` steps.
- `foc delete <ref>` needs `--yes`. On `confirmation_required`, relay the reason and rerun with `--yes` only after the user agrees.
- Never repeat a failed or interrupted `put` or `delete`: that starts a new paid operation. Run the `foc operations resume <id>` command from `next` instead. Find lost operation IDs with `foc operations ls --incomplete`.
- Retry only when `error.retryable` is `true`, after `retryAfterSeconds` when present.
