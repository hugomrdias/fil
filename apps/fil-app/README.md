# fil-app

A React app for Filecoin Onchain Cloud, built with [TanStack Start](https://tanstack.com/start) and rendered on a Cloudflare Worker. It has four parts:

- **Website** (`/`, `/docs`, `/agents`): the landing page, the docs, and the agent setup page. See [Website](#website).

- **Explorer** (`/mainnet`, `/calibration`): public pages for data sets, pieces, storage providers, Filecoin Pay rails and settlements, session keys, and per-address views. All data comes from [fil-api](../fil-api). The Worker renders these pages on the server.
- **Dashboard** (`/dashboard`): gated on a connected wallet, and rendered only in the browser. Manage your Filecoin Pay account (deposit, withdraw), the Warm Storage (FWSS) operator approval, data sets (create, terminate, delete pieces), uploads, rails (settle) and session keys (generate, authorize, revoke, sign with them).
- **Setup page** (`/dashboard/setup`): reviews a request from a [setup link](#setup-links) or an agent to authorize a session key, approve Warm Storage and deposit USDFC.

Built with:
- [TanStack Start](https://tanstack.com/start) on [Cloudflare Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)
- [TanStack Router](https://tanstack.com/router), [Query](https://tanstack.com/query), [Table](https://tanstack.com/table) and [Form](https://tanstack.com/form)
- [shadcn/ui](https://ui.shadcn.com) (preset `beEhf1ou`: Base UI, luma style, Inter, lucide) recoloured with the Filecoin brand ramp (`#0090FF` is `brand-700`), with the [command menu](https://ui.shadcn.com/docs/components/base/command) (`⌘K` or `/` from any page) and the [sidebar](https://ui.shadcn.com/blocks/sidebar) for the dashboard
- [wagmi](https://wagmi.sh) and [viem](https://viem.sh) with EIP-6963 injected wallets
- [`@filoz/synapse-core`](https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-core) and [`@filoz/synapse-react`](https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-react). The app never imports `@filoz/synapse-sdk`.

## Layout

| Path | Contents |
| --- | --- |
| `src/routes` | File-based routes. `__root.tsx` is the HTML document, `$network/*` is the explorer, and `dashboard/*` is the wallet dashboard |
| `src/router.tsx` | Router factory. Start creates a router and a query client for each request |
| `src/start.ts` | Request middleware that adds the security and WebMCP origin-trial headers, and serves site pages as Markdown |
| `src/content` | Markdown for the website's pages |
| `src/lib/site` | Page list, Markdown rendering, content negotiation, and the agent discovery files |
| `src/lib/api` | fil-api client (`openapi-fetch`), query factories, and the generated `schema.d.ts` |
| `src/hooks-synapse` | Hooks missing from `@filoz/synapse-react`, kept here until they move upstream. See [its README](src/hooks-synapse/README.md) |
| `src/components/ui` | shadcn components |
| `test` | Node test runner tests for the pure `src/lib` modules |

## Development

```bash
pnpm --filter fil-app dev
```

The dev server runs the app in workerd through the [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/), as in production.

The app calls `https://fil-api.hugomrdias.dev` by default. Set `VITE_FIL_API_URL` to point it elsewhere, for example a local `wrangler dev` of fil-api (see `.env.example`).

Scripts:
- `pnpm gen:api`: regenerates `src/lib/api/schema.d.ts` from fil-api's `/openapi.json`. Set `FIL_API_URL` to generate from another deployment. It runs `openapi-typescript` through `pnpm dlx` with TypeScript 5, because `openapi-typescript` does not support the repo's TypeScript 7.
- `pnpm test`: `node --test` over `test/**/*.test.ts`
- `pnpm typecheck` and `pnpm lint`

Session keys created in the dashboard are stored in the browser's `localStorage`, scoped by chain and wallet. They can only sign Warm Storage operations (create data set, add pieces, schedule piece removals, terminate service), never move funds. The "Sign storage actions with" choice in the dashboard account menu (bottom of the sidebar) chooses whether those operations use the session key or the wallet. The wallet is used whenever the key lacks the needed permission.

### Server rendering

Any module can run in the Worker as well as in the browser:

- Use browser APIs such as `window`, `localStorage`, and `navigator` only in effects, in event handlers, or under `/dashboard`, which sets `ssr: false`.
- The server cannot know the visitor's time zone, locale, platform, or clock. `LocalTime` in `src/components/local-time.tsx` formats timestamps in UTC until the page hydrates, then in local time. Render other values that depend on the browser after hydration with `useHydrated`, or React reports a hydration mismatch.
- Loaders run on the server for the first request and in the browser after that. `@tanstack/react-router-ssr-query` sends the queries fetched during server rendering to the browser with the page.
- The server renders the dark theme. An inline script in `<head>` applies a stored light theme before the first paint.

## Website

The landing page at `/` is a React page. The docs under `/docs` and the agent setup page at `/agents` render Markdown from `src/content` on the server, with [marked](https://marked.js.org). `src/lib/site/pages.ts` lists the pages and their order.

The Markdown files are edited copies of the READMEs, written for people who use `fil`, not for contributors. When a user-facing behavior changes, update both. Nothing from `docs/` is published.

Every page in `src/lib/site/pages.ts` also serves its Markdown:

- at `<path>.md`, such as `/docs/cli.md`, and `/index.md` for the landing page.
- at its own path when the request's `Accept` header names `text/markdown` at least as high as `text/html`. A browser's `*/*` still gets HTML.

The HTML responses send `Vary: Accept` and a `Link` header to the Markdown version.

Server routes serve the files that agents use to discover the site:

| Path | Contents |
| --- | --- |
| `/llms.txt`, `/llms-full.txt` | An [llms.txt](https://llmstxt.org) index of the docs, and every docs page in one file |
| `/.well-known/api-catalog` | An [RFC 9727](https://www.rfc-editor.org/rfc/rfc9727) linkset to fil-api's OpenAPI document, reference, and health check. `HEAD` returns the `api-catalog` link relation |
| `/.well-known/mcp/server-card.json`, `/.well-known/mcp-server-card` | fil-api's MCP server card, in the [SEP-2127](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2127-mcp-server-cards.md) format |
| `/.well-known/agent-skills/index.json` | The [agent skills discovery](https://github.com/cloudflare/agent-skills-discovery-rfc) index, with the SHA-256 digest of the `fil` skill |
| `/.well-known/agent-skills/fil/SKILL.md` | `packages/fil-cli/skills/fil/SKILL.md`, bundled at build time |

The API URLs in these files come from `VITE_FIL_API_URL`.

## Setup links

`fil login`, `fil status` and the `put` funding check send the wallet owner to `/dashboard/setup`. The page prefills a request from its search params, and the owner reviews it, changes what they need, and approves each step with their wallet. Each step is its own transaction, so nothing is signed until the owner clicks.

| Param | Meaning |
| --- | --- |
| `network` | `mainnet` or `calibration`. The page asks to switch the wallet when it is on the other network |
| `signer` | Session key address to authorize. The private key stays with the tool that made it, such as `fil`; the app never sees it |
| `name` | Session key name, up to 64 characters, recorded on chain as the authorization's `origin`. Default: `fil-app` |
| `scopes` | Comma-separated scope IDs: `createDataSet`, `addPieces`, `schedulePieceRemovals`, `terminateService`. Default: the first three |
| `days` | Days until the authorization expires, from 1 to 365. Default: 30 |
| `deposit` | USDFC to deposit, as a decimal amount |

Every param is optional, and the page drops an invalid value instead of failing. The Warm Storage step appears whenever the wallet has not approved it. `src/lib/setup-request.ts` holds the parsing, and `packages/fil-cli/src/auth/login.ts` builds the links.

### WebMCP

The app registers [WebMCP](https://webmachinelearning.github.io/webmcp/) tools, so a browser agent can prepare the same request without building a URL, and read the account and its storage:

| Tool | Where | What it does |
| --- | --- | --- |
| `prepare_setup_request` | Every page | Validates a request with the params above (`scopes` as an array, `days` as a number) and opens the prefilled setup page. It never signs anything |
| `get_setup_status` | `/dashboard/setup` | Read-only. Reports whether a wallet is connected and on Filecoin. Once it is, also reports which requested scopes are authorized and until when, the Warm Storage approval and the Pay balance |
| `get_account_summary` | Every page | Read-only. Reports a wallet's Filecoin Pay funds, monthly spend and runway, the Warm Storage approval, and whether it can pay for a new upload. When it cannot, it returns a prefilled setup link |
| `list_data_sets` | Every page | Read-only. Lists a wallet's data sets |
| `list_pieces` | Every page | Read-only. Lists a data set's pieces, each with a retrieval URL |
| `lookup_piece` | Every page | Read-only. Finds the data sets that hold a PieceCID v2 |
| `list_session_keys` | Every page | Read-only. Lists the session keys a wallet authorized, with each permission's expiry and on-chain name |

The read-only tools default to the connected wallet and to the network in the page URL, else the wallet's network. Their input schemas come from the zod schemas in `src/lib/read-tools.ts`, which also parse each call. Bad input and failed reads return `{ ok: false, errors }` instead of throwing. Lists take `limit` (up to 100) and the previous page's `nextCursor`.

WebMCP is an early preview. Production turns it on for Chrome 149 and later through the [WebMCP origin trial](https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241): `src/start.ts` sends the `Origin-Trial` token for `https://fil-app.hugomrdias.dev`, which expires on 2027-03-30. Renew the token before then, or remove the header when the trial ends. The token does not cover other origins, such as PR previews and local dev, so use `chrome://flags/#enable-webmcp-testing` there. Other browsers skip the tools, and the page works the same.

The ChatGPT desktop app's built-in browser calls WebMCP tools "site tools", and the ChatGPT Chrome extension also finds them. That runtime does not check input against `inputSchema` and passes no `options` to `execute`, so each tool validates its own input. See the [Codex site tools compatibility notes](https://docs.mcp-b.ai/reference/webmcp/codex-site-tools).

## Deploy

The app deploys as a Worker (`wrangler.jsonc`) at https://fil-app.hugomrdias.dev. The Worker renders pages, and Cloudflare serves the client build from `dist/client` as static assets. `public/_headers` sets the cache headers for those assets. [`.github/workflows/fil-app.yml`](../../.github/workflows/fil-app.yml) mirrors fil-api's workflow:

| Trigger | Result |
| --- | --- |
| Push to `main` | Runs typecheck, tests, lint and build, then `wrangler deploy` and probes a server-rendered page |
| Pull request opened or updated | Builds, creates a `wrangler preview --name pr-<number>`, probes it and comments the URL on the PR |
| Pull request closed | `wrangler preview delete` |

The production deploy uses its own `fil-app-production` GitHub environment. The workflow uses the same `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets as fil-api.
