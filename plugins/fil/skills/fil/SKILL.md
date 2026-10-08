---
name: fil
description: Store files and folders on Filecoin with the fil CLI, return links to share them, and retrieve and verify them later. Use when the user asks to publish, store, share, back up, retrieve, or verify content on Filecoin.
---

# fil

`fil` stores a file (its exact bytes) or a folder (a UnixFS CAR served over IPFS) on Filecoin and returns links to share it. A person owns the wallet and approves what you may do. You never hold the wallet key.

## Run it

Run `fil` when it is on the PATH. Otherwise run `npx -y @hugomrdias/fil` in its place, which needs Node.js 24 or newer.

Every command writes one JSON object to stdout: `data` on success or `error` on failure, then optional `next` steps. Branch on `error.code`, never on stderr text.

Don't guess flags or fields. The installed CLI describes itself:

- `fil --help` lists the commands, and `fil <command> --help` shows examples and flags.
- `fil schema <command>` gives the input and output JSON Schemas, and what each error code means.

## Workflow

1. `fil status` shows whether a session key is approved and the account is funded.
2. `fil put <path> --dry-run` reports the size, provider, cost, and missing authorization without storing anything.
3. `fil put <path>` stores it. Give the user `data.urls.browser` exactly as returned, with `data.resource.ref`.
4. `fil get <ref>` downloads the content and verifies it. `fil ls` and `fil inspect <ref>` find what was stored.

## Rules

- Never ask for or pass a private key. Logging in needs the user: `auth_required` or `login_pending` means relay the `by: "user"` step (the fil-app approval link) and stop. After the user approves, run `fil login` once to confirm.
- `insufficient_funds` and `session_expired` also need the user. Relay their `next` steps.
- `fil delete <ref>` needs `--yes`. On `confirmation_required`, relay the reason and rerun with `--yes` only after the user agrees.
- Never repeat a failed or interrupted `put` or `delete`: that starts a new paid operation. Run the `fil operations resume <id>` command from `next` instead. Errors with a fil code also carry the ID in `error.details.operationId`. Find lost operation IDs with `fil operations ls --incomplete`.
- Retry only when `error.retryable` is `true`, after `retryAfterSeconds` when present.

## Read more only when you need it

Fetch these pages; each is Markdown:

- No browser to open, or a disk that is gone when the session ends, such as a cloud sandbox: read [Cloud agents](https://fil-app.hugomrdias.dev/agents.md#cloud-agents) before `fil login`.
- A link returns 404, the user wants proof the content is intact, or `fil ls` is missing content stored elsewhere: read [Retrieve and verify](https://fil-app.hugomrdias.dev/docs/retrieve.md).
