# fil-app

A Vite + React single-page app for Filecoin Onchain Cloud. It has two parts:

- **Explorer** (`/mainnet`, `/calibration`): public pages for data sets, pieces, storage providers, Filecoin Pay rails and settlements, session keys, and per-address views. All data comes from [fil-api](../fil-api).
- **Dashboard** (`/dashboard`): gated on a connected wallet. Manage your Filecoin Pay account (deposit, withdraw), the Warm Storage (FWSS) operator approval, data sets (create, terminate, delete pieces), uploads, rails (settle) and session keys (generate, authorize, revoke, sign with them).

Built with:
- [TanStack Router](https://tanstack.com/router), [Query](https://tanstack.com/query), [Table](https://tanstack.com/table) and [Form](https://tanstack.com/form)
- [shadcn/ui](https://ui.shadcn.com) (preset `b1ZhhFHhw`: Base UI, lyra style, Inter, lucide) recoloured with the Filecoin brand ramp (`#0090FF` is `brand-700`)
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

Session keys created in the dashboard are stored in the browser's `localStorage`, scoped by chain and wallet. They can only sign Warm Storage operations (create data set, add pieces, schedule piece removals, terminate service), never move funds. The "Sign storage actions with" picker in the dashboard sidebar chooses whether those operations use the session key or the wallet. The wallet is used whenever the key lacks the needed permission.

## Deploy

The app deploys as a static-assets Worker (`wrangler.jsonc`, SPA fallback) at https://fil-app.hugomrdias.dev. [`.github/workflows/fil-app.yml`](../../.github/workflows/fil-app.yml) mirrors fil-api's workflow:

| Trigger | Result |
| --- | --- |
| Push to `main` | Runs typecheck, tests, lint and build, then `wrangler deploy` and probes a deep link |
| Pull request opened or updated | Builds, creates a `wrangler preview --name pr-<number>`, probes it and comments the URL on the PR |
| Pull request closed | `wrangler preview delete` |

The workflow uses the same `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets as fil-api.
