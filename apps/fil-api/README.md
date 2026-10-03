# fil-api

A Cloudflare Worker that serves a read-only REST API and an MCP server for Filecoin Onchain Cloud data: storage providers, data sets, pieces, Filecoin Pay rails and session keys. Data comes from the Ponder indexer Postgres database (schemas `early-repair` and `foc-observer`) through [Hyperdrive](https://developers.cloudflare.com/hyperdrive/).

Built with [Hono](https://hono.dev), [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi), [`@hono/mcp`](https://github.com/honojs/middleware/tree/main/packages/mcp) and [postgres.js](https://github.com/porsager/postgres).

## Routes

| Route | Description |
| --- | --- |
| `GET /openapi.json` | OpenAPI 3.1 document |
| `GET /docs` | API reference (Scalar) |
| `POST /mcp` | MCP server (Streamable HTTP, stateless) |
| `GET /health` | Latest indexed block per network and indexer; `503` if a configured database fails |

Every data route is namespaced by network: `/calibration/...` or `/mainnet/...`.

| Route | Filters |
| --- | --- |
| `/{network}/status` | none |
| `/{network}/providers` | `approved`, `active`, `endorsed` |
| `/{network}/providers/{providerId}` | none |
| `/{network}/data-sets` | `owner`, `provider_id`, `deleted`, `with_cdn` |
| `/{network}/data-sets/{dataSetId}` | none |
| `/{network}/data-sets/{dataSetId}/pieces` | `removed` |
| `/{network}/data-sets/{dataSetId}/pieces/{pieceId}` | none |
| `/{network}/pieces` | `owner`, `cid`, `provider_id`, `removed` (at least one of the first three is required) |
| `/{network}/rails` | `payer`, `payee`, `operator`, `token`, `state` (`active`, `terminated` or `finalized`) |
| `/{network}/rails/{railId}` | none |
| `/{network}/rails/{railId}/settlements` | none |
| `/{network}/session-keys` | `identity`, `signer`, `active` |
| `/{network}/session-keys/history` | `identity`, `signer` |

Conventions:
- **Owner** is the client address that pays for a data set (`data_sets.payer`).
- **Rails** are rebuilt from Filecoin Pay events. Session keys are rebuilt from SessionKeyRegistry `AuthorizationsUpdated` events, keeping the latest expiry for each permission.
- **Big numbers** (ids, amounts, epochs) are returned as decimal strings.
- **Pagination** uses `limit` (1–200, default 50) and an opaque `cursor`. Each response looks like `{ data, nextCursor }`.
- **Errors** look like `{ error: { code, message } }`.

The MCP server offers one tool per route: `get_status`, `list_providers`, `get_provider`, `list_data_sets`, `get_data_set`, `list_data_set_pieces`, `get_piece`, `list_pieces`, `list_rails`, `get_rail`, `list_rail_settlements`, `list_session_keys` and `list_session_key_events`. Each tool requires a `network` argument.

## Development

Copy `.env.example` to `.env` (gitignored) and fill in a connection string for every Hyperdrive binding in `wrangler.jsonc`. Wrangler reads these from `.env` or the shell, not from `.dev.vars`. The `dev` script sets `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false` so the connection strings are not also exposed to the Worker as secrets:

```bash
cp .env.example .env
```

Then start the dev server:

```bash
pnpm --filter fil-api dev
```

Scripts:
- `pnpm test`: vitest in workerd via `@cloudflare/vitest-pool-workers`, with a fake database
- `pnpm typecheck`: checks that the generated worker types are current and runs `tsc`
- `pnpm cf-typegen`: regenerates `worker-configuration.d.ts` after changing `wrangler.jsonc`

## Deploy

[`.github/workflows/fil-api.yml`](../../.github/workflows/fil-api.yml) deploys automatically:

| Trigger | Result |
| --- | --- |
| Push to `main` | Runs typecheck, tests and lint, then `wrangler deploy` to https://fil-api.hugomrdias.dev and probes `/health` |
| Pull request opened or updated | `wrangler preview --name pr-<number>` creates a [Worker Preview](https://developers.cloudflare.com/workers/previews/) on `workers.dev`, probes `/health` and comments its URL on the PR |
| Pull request closed | `wrangler preview delete` removes the preview |

The workflow only runs when `apps/fil-api`, the lockfile, `pnpm-workspace.yaml`, `turbo.json` or the workflow itself changes. Pull requests from forks get no preview, because they can't read the secrets.

Previews don't inherit production bindings, so the `previews` block in `wrangler.jsonc` repeats both Hyperdrive bindings. Previews read the same read-only databases as production but use separate rate-limit namespaces.

### Setup

1. Create a Cloudflare API token from the **Edit Cloudflare Workers** template. Scope it to your account and the `hugomrdias.dev` zone.
2. Add the repository secrets:
   ```bash
   gh secret set CLOUDFLARE_API_TOKEN
   gh secret set CLOUDFLARE_ACCOUNT_ID
   ```
3. Create a Hyperdrive config for each network and put the ids in `wrangler.jsonc`, in both the top-level `hyperdrive` list and `previews.hyperdrive`:
   ```bash
   wrangler hyperdrive create fil-api-calibration --connection-string="postgresql://user:password@host:5432/indexers"
   ```

To deploy manually, run `pnpm --filter fil-api deploy`.

Each network needs its own Hyperdrive binding. Run `pnpm cf-typegen` after changing bindings. A network without a binding returns `503 network_unavailable`.

## Observability and limits

- **Workers Logs and traces** are enabled in `wrangler.jsonc`. Each request writes one JSON log line with `requestId`, `route`, `network`, `status`, `durationMs`, `dbQueries` and `dbMs`.
- **Response headers:** `X-Request-Id`, and `Server-Timing` with `db` and `total` metrics.
- **Rate limits:** [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) per client IP, at 120 requests/min for the REST API and 60 requests/min for MCP. Over the limit, requests get a `429` with `Retry-After`.
- **Caching:** successful reads are sent with `Cache-Control: public, max-age=15, stale-while-revalidate=60`.
