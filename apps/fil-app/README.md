# fil-app

A Vite + React single-page app for Filecoin Onchain Cloud. It has two parts:

- **Explorer** (`/mainnet`, `/calibration`): public pages for data sets, pieces, storage providers, Filecoin Pay rails and settlements, session keys, and per-address views. All data comes from [fil-api](../fil-api).
- **Dashboard** (`/dashboard`): gated on a connected wallet. Manage your Filecoin Pay account (deposit, withdraw), the Warm Storage (FWSS) operator approval, data sets (create, terminate, delete pieces), uploads, rails (settle) and session keys (generate, authorize, revoke, sign with them).
- **Setup page** (`/dashboard/setup`): reviews a request from a [setup link](#setup-links) or an agent to authorize a session key, approve Warm Storage and deposit USDFC.

Built with:
- [TanStack Router](https://tanstack.com/router), [Query](https://tanstack.com/query), [Table](https://tanstack.com/table) and [Form](https://tanstack.com/form)
- [shadcn/ui](https://ui.shadcn.com) (preset `beEhf1ou`: Base UI, luma style, Inter, lucide) recoloured with the Filecoin brand ramp (`#0090FF` is `brand-700`), with the [command menu](https://ui.shadcn.com/docs/components/base/command) (`⌘K` or `/` from any page) and the [sidebar](https://ui.shadcn.com/blocks/sidebar) for the dashboard
- [wagmi](https://wagmi.sh) and [viem](https://viem.sh) with EIP-6963 injected wallets
- [`@filoz/synapse-core`](https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-core) and [`@filoz/synapse-react`](https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-react). The app never imports `@filoz/synapse-sdk`.

## Layout

| Path | Contents |
| --- | --- |
| `src/routes` | File-based routes. `$network/*` is the explorer and `dashboard/*` is the wallet dashboard |
| `src/lib/api` | fil-api client (`openapi-fetch`), query factories, and the generated `schema.d.ts` |
| `src/hooks-synapse` | Hooks missing from `@filoz/synapse-react`, kept here until they move upstream. See [its README](src/hooks-synapse/README.md) |
| `src/components/ui` | shadcn components |
| `test` | Node test runner tests for the pure `src/lib` modules |

## Development

```bash
pnpm --filter fil-app dev
```

The app calls `https://fil-api.hugomrdias.dev` by default. Set `VITE_FIL_API_URL` to point it elsewhere, for example a local `wrangler dev` of fil-api (see `.env.example`).

Scripts:
- `pnpm gen:api`: regenerates `src/lib/api/schema.d.ts` from fil-api's `/openapi.json`. Set `FIL_API_URL` to generate from another deployment. It runs `openapi-typescript` through `pnpm dlx` with TypeScript 5, because `openapi-typescript` does not support the repo's TypeScript 7.
- `pnpm test`: `node --test` over `test/**/*.test.ts`
- `pnpm typecheck` and `pnpm lint`

Session keys created in the dashboard are stored in the browser's `localStorage`, scoped by chain and wallet. They can only sign Warm Storage operations (create data set, add pieces, schedule piece removals, terminate service), never move funds. The "Sign storage actions with" choice in the dashboard account menu (bottom of the sidebar) chooses whether those operations use the session key or the wallet. The wallet is used whenever the key lacks the needed permission.

## Setup links

`fil login`, `fil status` and the `put` funding check send the wallet owner to `/dashboard/setup`. The page prefills a request from its search params, and the owner reviews it, changes what they need, and approves each step with their wallet. Each step is its own transaction, so nothing is signed until the owner clicks.

| Param | Meaning |
| --- | --- |
| `network` | `mainnet` or `calibration`. The page asks to switch the wallet when it is on the other network |
| `signer` | Session key address to authorize. The private key stays with the tool that made it, such as `fil`; the app never sees it |
| `name` | Session key name, up to 64 characters, recorded on chain as the authorization's `origin`. Default: `fil` |
| `scopes` | Comma-separated scope IDs: `createDataSet`, `addPieces`, `schedulePieceRemovals`, `terminateService`. Default: the first three |
| `days` | Days until the authorization expires, from 1 to 365. Default: 30 |
| `deposit` | USDFC to deposit, as a decimal amount |

Every param is optional, and the page drops an invalid value instead of failing. The Warm Storage step appears whenever the wallet has not approved it. `src/lib/setup-request.ts` holds the parsing, and `packages/fil-cli/src/auth/login.ts` builds the links.

### WebMCP

The app registers [WebMCP](https://webmachinelearning.github.io/webmcp/) tools, so a browser agent can prepare the same request without building a URL:

| Tool | Where | What it does |
| --- | --- | --- |
| `prepare_setup_request` | Every page | Validates a request with the params above (`scopes` as an array, `days` as a number) and opens the prefilled setup page. It never signs anything |
| `get_setup_status` | `/dashboard/setup`, once a wallet is connected | Read-only. Reports which requested scopes are authorized and until when, the Warm Storage approval and the Pay balance |

WebMCP is an early preview. Production turns it on for Chrome 149 and later through the [WebMCP origin trial](https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241): `public/_headers` sends the `Origin-Trial` token for `https://fil-app.hugomrdias.dev`, which expires on 2027-03-30. Renew the token before then, or remove the header when the trial ends. The token does not cover other origins, such as PR previews and local dev, so use `chrome://flags/#enable-webmcp-testing` there. Other browsers skip the tools, and the page works the same.

## Deploy

The app deploys as a static-assets Worker (`wrangler.jsonc`, SPA fallback) at https://fil-app.hugomrdias.dev. [`.github/workflows/fil-app.yml`](../../.github/workflows/fil-app.yml) mirrors fil-api's workflow:

| Trigger | Result |
| --- | --- |
| Push to `main` | Runs typecheck, tests, lint and build, then `wrangler deploy` and probes a deep link |
| Pull request opened or updated | Builds, creates a `wrangler preview --name pr-<number>`, probes it and comments the URL on the PR |
| Pull request closed | `wrangler preview delete` |

The production deploy uses its own `fil-app-production` GitHub environment. The workflow uses the same `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets as fil-api.
