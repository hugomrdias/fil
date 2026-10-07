# fil-api

A Cloudflare Worker that serves a read-only REST API and an MCP server for Filecoin data: storage providers, data sets, pieces, Filecoin Pay rails and session keys. Data comes from the Ponder indexer Postgres database (schemas `early-repair` and `foc-observer`) through [Hyperdrive](https://developers.cloudflare.com/hyperdrive/).

Built with [Hono](https://hono.dev), [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi), [`@hono/mcp`](https://github.com/honojs/middleware/tree/main/packages/mcp) and [postgres.js](https://github.com/porsager/postgres).

## Routes

| Route | Description |
| --- | --- |
| `GET /openapi.json` | OpenAPI 3.1 document |
| `GET /docs` | API reference (Scalar) |
| `POST /mcp` | MCP server (Streamable HTTP, stateless) |
| `GET /health` | Latest indexed block per network and indexer; `503` if a configured database fails |
| `GET /get/{cid}` | Redirect to where a PieceCID or IPFS root CID can be retrieved (see [Retrieval](#retrieval)) |

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
| `/{network}/pieces` | `owner`, `cid` (a PieceCID v2; legacy v1 PieceCIDs and other strings return `400`), `provider_id`, `removed` (at least one of the first three is required) |
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

### Retrieval

`GET /get/{cid}?network=mainnet&browser=false` redirects (`302`) to where the content can be fetched. The Worker never proxies the bytes. `network` defaults to `mainnet`. The CID's codec and multihash decide where the redirect goes:

| CID | `browser` | Redirect |
| --- | --- | --- |
| PieceCID v2 (`bafkzcib…`) | `false` or absent | `{serviceUrl}/piece/{cid}` on a provider storing the piece |
| PieceCID v2 (`bafkzcib…`) | `true` | `https://inbrowser.link/ipfs/{root}` when the chosen copy has `ipfsRootCID` metadata in an IPFS-indexed data set, otherwise `{serviceUrl}/piece/{cid}` |
| Other CID (IPFS content) | `false` or absent | `{serviceUrl}/ipfs/{cid}` on a provider with a piece whose `ipfsRootCID` metadata matches, in an IPFS-indexed data set |
| Other CID (IPFS content) | `true` | `https://inbrowser.link/ipfs/{cid}`, without a database lookup |

Legacy v1 PieceCIDs (`baga…`) and strings that aren't CIDs return `400`. If no live copy exists, the response is `404`. Other query parameters, such as `format=car`, are forwarded to the target. When several providers store the content, the route ranks endorsed providers first, then approved ones, then the oldest copy.

Resolved providers are cached per network and CID in the [Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) with stale-while-revalidate:
- An entry is fresh for 10 minutes.
- After that, it is still served immediately for up to 24 hours, and refreshed in the background after the response.
- The `X-Cache` response header reports `hit`, `stale`, `miss` or `none`.
- The cache is per datacenter, and it does nothing on `workers.dev` preview URLs.

The MCP server offers one tool per data route: `get_status`, `list_providers`, `get_provider`, `list_data_sets`, `get_data_set`, `list_data_set_pieces`, `get_piece`, `list_pieces`, `list_rails`, `get_rail`, `list_rail_settlements`, `list_session_keys` and `list_session_key_events`. Each tool requires a `network` argument.

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
- `pnpm test`: vitest in workerd via `@cloudflare/vitest-plugin`, with a fake database
- `pnpm typecheck`: checks that the generated worker types are current and runs `tsc`
- `pnpm cf-typegen`: regenerates `worker-configuration.d.ts` after changing `wrangler.jsonc`

## Deploy

[`.github/workflows/fil-api.yml`](../../.github/workflows/fil-api.yml) deploys automatically:

| Trigger | Result |
| --- | --- |
| Push to `main` | Runs typecheck, tests and lint, then `wrangler deploy` to https://fil-api.hugomrdias.dev and probes `/health` |
| Pull request opened or updated | `wrangler preview --name pr-<number>` creates a [Worker Preview](https://developers.cloudflare.com/workers/previews/) on `workers.dev`, probes `/health` and comments its URL on the PR |
| Pull request closed | `wrangler preview delete` removes the preview |

The production deploy uses the `fil-api-production` GitHub environment, so its deployment history, URL and any protection rules stay separate from fil-app's. The workflow only runs when `apps/fil-api`, the lockfile, `pnpm-workspace.yaml`, `turbo.json` or the workflow itself changes. Pull requests from forks get no preview, because they can't read the secrets.

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
   wrangler hyperdrive create fil-api-calibration --connection-string="postgresql://user:password@host:5432/indexers" --max-age 5 --swr 0
   ```
   Hyperdrive caches read queries for 60 seconds by default and never invalidates them, which would make the indexer status, and every read after a write, up to 75 seconds stale. Both configs cache for 5 seconds with no stale-while-revalidate. To change an existing config, run `wrangler hyperdrive update <id> --caching-disabled=false --max-age 5 --swr 0`.

To deploy manually, run `pnpm --filter fil-api deploy`.

Each network needs its own Hyperdrive binding. Run `pnpm cf-typegen` after changing bindings. A network without a binding returns `503 network_unavailable`.

### Placement

The Worker runs in Frankfurt, set by `placement.region: "gcp:europe-west3"` in `wrangler.jsonc`. The `cf-placement` response header shows where a request ran, such as `remote-FRA`.

Previews run without placement. Cloudflare documents that Previews inherit top-level placement, and `wrangler preview` sends it, but on 2026-10-07 the API stored the Preview deployment with `"placement": {}`, and responses carried no `cf-placement` header. Preview timings therefore do not show production's placement.

Both indexer databases run on Hetzner in Helsinki, and Hyperdrive keeps their connection pool in Frankfurt. Each query travels from the Worker to the pool and from there to Helsinki. The query itself takes about 0.05 ms on Postgres, so network distance makes up nearly all of the database time. A request's first query costs about two round trips to the pool, so a Worker far from Frankfurt pays that distance twice, even though every route runs one query.

We measured this on 2026-10-07 with test Workers sharing production's Hyperdrive configs. An uncached query took this long from each Worker location:

| Worker location | Time per query |
| --- | --- |
| Frankfurt | ~30 ms |
| Amsterdam | ~37 ms |
| London | ~45 ms |
| Helsinki, next to the databases | ~60 ms |
| Lisbon, with no placement | ~70 ms |
| US East | ~127 ms |

From [Globalping](https://globalping.io) probes in ten cities, with uncached reads and no placement, database time grew with distance from Frankfurt, up to 610 ms from Sydney. Pinned to Frankfurt, it stayed between 40 and 65 ms from every city, and median time to first byte about halved outside Europe. Clients close to Frankfurt gain little: from Lisbon, the median rose from 106 to 122 ms.

We rejected the other placement options:

- **Helsinki** (`gcp:europe-north1`) is slower than Frankfurt, because queries go to the Frankfurt pool and back.
- **Smart Placement** (`mode: "smart"`) still ran the Worker at the nearest location 30 minutes after deploy. It needs steady traffic from many locations, and it only picks locations where the Worker already runs.
- **Host probes** (`placement.host` set to the database) also picked Frankfurt, but Cloudflare marks them experimental and they took minutes to settle.

Keep `prepare: true` in `src/db.ts`. With `prepare: false`, each query costs a second round trip: about 130 ms instead of 70 ms from Lisbon.

If the databases move, measure again. A database a few milliseconds from Frankfurt, such as one on Hetzner in Falkenstein or Nuremberg, should cut queries to about 5–10 ms, but we have not measured it.

## Observability and limits

- **Workers Logs and traces** are enabled in `wrangler.jsonc`. Cloudflare writes one invocation log per request (method, URL, status, CPU and wall time). The app adds no per-request log line; it only logs unexpected errors.
- **Trace spans:** the root span gets `http.route`, `fil.network` and `fil.db.queries` attributes, and every database query runs in a `db.query` child span with its SQL text and returned row count. Workers tracing only records a `hyperdrive_connect` span for opening the connection, so these spans are the only place query time shows up. Unexpected errors are recorded on the root span.
- **Request ids:** `X-Request-Id` is the Cloudflare Ray ID, the same value as `$metadata.rayId` on every log and span, so one id from a client finds the whole request. Client-sent `X-Request-Id` headers are ignored.
- **Response headers:** `X-Request-Id`, and `Server-Timing` with `db` and `total` metrics.
- **Unknown paths:** only `/calibration/...` and `/mainnet/...` reach the network middleware and API rate limiter. Other paths, such as crawler requests for `/sitemap.xml`, get a plain `404 not_found`. A valid route under an unsupported network, such as `/filecoin/providers`, gets `404 unknown_network`.
- **Rate limits:** [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) per client IP, at 120 requests/min for the REST API and `/health`, and 60 requests/min for MCP. Over the limit, requests get a `429` with `Retry-After`.
- **Caching:** data responses carry no `max-age`, so browsers and proxies never serve a stored copy and every request reaches the Worker; `/health` sends `no-store`. Indexed data changes every 30-second epoch, and a cached response would show a write as missing after the indexer had it. Data reads are only cached by Hyperdrive's 5-second query cache (see the setup steps). Responses that do not depend on fresh indexer data keep a `max-age`: `/openapi.json` (`300`) only changes on deploy, a `/get/{cid}` redirect to inbrowser.link (`86400`) is built from the request alone, and a redirect to a provider (`60`) is already served from the provider cache.
