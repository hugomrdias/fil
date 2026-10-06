---
name: fil
description: Store files and folders on Filecoin Onchain Cloud with the fil CLI and return retrieval links; download, list, delete, and resume interrupted uploads. Use when the user asks to publish, store, share, or retrieve content on Filecoin or FOC.
---

# fil

`fil` stores a file (exact bytes) or a folder (a UnixFS CAR served over IPFS) on Filecoin Onchain Cloud and returns a link. Every command writes one JSON object to stdout when run by an agent; it has `data` on success or `error` on failure. Branch on `error.code`, never on stderr text.

## Discover before you call

- `fil schema --list` lists every command with its side effects.
- `fil schema <command>` gives the input JSON Schema, the JSON Schema of `data`, and what each error code means, for the installed version. Prefer it over guessing flags.

## Workflow

1. `fil status` shows whether a session key is active and the account is funded.
2. `fil put <path> --dry-run` shows the size, provider, cost, and any missing authorization without storing anything.
3. `fil put <path>` (or `fil publish <path>`) stores it. Return `data.urls.browser` to the user exactly as given, with `data.resource.ref`. `data.urls.piece` serves the exact stored bytes. A new link can return 404 until the indexer behind it has the piece; `fil inspect <ref> --check` reports when it answers.
4. `fil get <ref>` downloads and verifies content; `fil ls` and `fil inspect <ref>` find what was stored.

## Rules

- Never ask for or pass a private key. Logging in needs the user: `auth_required` or `login_pending` means relay the `by: "user"` step (the fil-app approval link) and stop. After the user approves, run `fil login` once to confirm.
- `insufficient_funds` and `session_expired` also need the user; relay their `next` steps.
- `fil delete <ref>` needs `--yes`. On `confirmation_required`, relay the reason and rerun with `--yes` only after the user agrees.
- Never repeat a failed or interrupted `put` or `delete`: that starts a new paid operation. Run the `fil operations resume <id>` command from `next` instead; errors with a fil code also carry the ID in `error.details.operationId`. Find lost operation IDs with `fil operations ls --incomplete`.
- Retry only when `error.retryable` is `true`, after `retryAfterSeconds` when present.
