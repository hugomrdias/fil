# MCP domains

This document plans how to serve fil-api's MCP server from its own hostname, such as `https://mcp.hugomrdias.dev`, instead of `https://fil-api.hugomrdias.dev/mcp`. It covers two cases: a subdomain of `hugomrdias.dev`, whose DNS Cloudflare manages, and a domain whose DNS another provider manages, such as `filecoin.io` on DNSimple. None of it is built yet.

We checked the Cloudflare behavior below against the Cloudflare docs on 2026-10-14.

## What the MCP host serves

The same `fil-api` Worker serves the MCP host. A host check in [`src/index.ts`](../../apps/fil-api/src/index.ts) rewrites the request before the Hono app sees it, so the MCP host reuses the `/mcp` handler, its rate limit, CORS, request ids, and tracing. The MCP host serves only MCP:

| Request on the MCP host | Result |
| --- | --- |
| `POST /` | The MCP endpoint, the same as `POST https://fil-api.hugomrdias.dev/mcp` |
| `GET /`, `DELETE /` | `405`, as on `/mcp`, because the server is stateless |
| `OPTIONS /` | The CORS preflight |
| Any other path, such as `/mcp`, `/health`, `/docs`, or `/calibration/providers` | `404 not_found` |

`https://fil-api.hugomrdias.dev/mcp` keeps working, because installed plugins and connectors already point to it.

A sketch of the host check, with the MCP hostnames in a `MCP_HOSTS` variable in `wrangler.jsonc`, so adding a hostname changes no code:

```ts
const app = createApp()

/** Worker entrypoint. Serves only the MCP endpoint, at `/`, on the MCP hosts. */
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    if (!env.MCP_HOSTS.split(',').includes(url.hostname)) {
      return app.fetch(request, env, ctx)
    }
    if (url.pathname !== '/') {
      return Response.json(errorBody('not_found', 'Route not found'), { status: 404 })
    }
    url.pathname = '/mcp'
    return app.fetch(new Request(url, request), env, ctx)
  },
}
```

Worker Previews run on `workers.dev`, which matches no MCP host, so they keep serving MCP at `/mcp`.

## A subdomain of hugomrdias.dev

`hugomrdias.dev` is a zone in the Cloudflare account, so the MCP host can be a second [Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) on the Worker, next to `fil-api.hugomrdias.dev`:

```jsonc
"routes": [
  { "pattern": "fil-api.hugomrdias.dev", "custom_domain": true },
  { "pattern": "mcp.hugomrdias.dev", "custom_domain": true }
],
```

`wrangler deploy` creates the DNS record and the certificate. Cloudflare can't create a Custom Domain on a hostname that already has a CNAME record, so delete any hand-made `mcp` record before the deploy. The deploy token already covers the `hugomrdias.dev` zone ([setup](../../apps/fil-api/README.md#setup)).

## A domain on another DNS provider

A Custom Domain needs the hostname to be in a zone on the Cloudflare account, so it can't serve a hostname such as `mcp.filecoin.io`, whose DNS is on DNSimple. A CNAME alone doesn't work either: if `mcp.filecoin.io` points to `fil-api.hugomrdias.dev`, Cloudflare receives requests for a hostname it doesn't know and rejects them.

[Cloudflare for SaaS](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/) connects the hostname to the `hugomrdias.dev` zone as a custom hostname, and the domain's DNS stays on DNSimple. It is available on the Free plan; [Plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/) lists the hostname limits and prices.

On Cloudflare, in the `hugomrdias.dev` zone:

1. Enable Cloudflare for SaaS.
2. Create a proxied `fallback.hugomrdias.dev AAAA 100::` record and set it as the fallback origin. The Worker is the real origin, so the record only has to exist ([Workers as your fallback origin](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/)).
3. Add `mcp.filecoin.io` as a custom hostname. Cloudflare shows the records that prove ownership and validate the certificate.
4. Add a Worker route for the hostname in `wrangler.jsonc`. It is a route, not a Custom Domain:
   ```jsonc
   { "pattern": "mcp.filecoin.io/*", "zone_name": "hugomrdias.dev" }
   ```
   We haven't tried this route in `wrangler deploy`. If Wrangler rejects it, add the route to the zone in the dashboard instead.
5. Add `mcp.filecoin.io` to `MCP_HOSTS`.

On DNSimple, the owner of `filecoin.io` adds:

| Record | Value |
| --- | --- |
| `mcp.filecoin.io CNAME` | `fallback.hugomrdias.dev` |
| The TXT records from step 3 | Only needed to issue the certificate before the CNAME goes live |

The owner doesn't move the domain or give anyone access to it. Once the CNAME points to Cloudflare, Cloudflare renews the certificate over HTTP, so the TXT records can go.

Steps 1 to 3 are one-time dashboard steps. Automating them through the API would need a deploy token with SSL and certificate permissions, which it doesn't have today.

## Rejected options

- **Redirects.** A Cloudflare redirect rule or a DNSimple URL record could send the MCP host to `fil-api.hugomrdias.dev/mcp`. MCP clients don't reliably follow redirects on `POST`, and some reject a redirect to another origin.
- **Moving the zone to Cloudflare.** Moving `filecoin.io` to Cloudflare would allow a Custom Domain, but its owner would have to leave DNSimple. A partial (CNAME) zone setup keeps DNSimple, but needs a Business plan.
- **An apex domain.** The DNSimple plan works for a subdomain such as `mcp.filecoin.io`, not for `filecoin.io` itself, because an apex can't be a CNAME. Proxying an apex needs Cloudflare's Enterprise Apex Proxying.

## What else changes with the URL

These files name `https://fil-api.hugomrdias.dev/mcp`. Each one moves to the new URL when the MCP host goes live:

- The plugin's [`mcp.json`](../../plugins/fil/mcp.json) and [`.claude-plugin/plugin.json`](../../plugins/fil/.claude-plugin/plugin.json), and the custom connector URL in its [README](../../plugins/fil/README.md)
- The MCP server row in the [fil README](README.md)
- fil-app's [discovery files](../../apps/fil-app/src/lib/site/discovery.ts), which build the URL as the API origin plus `/mcp`, so they need their own MCP URL setting
- fil-app's [landing page](../../apps/fil-app/src/routes/index.tsx) and the [`index.md`](../../apps/fil-app/src/content/index.md) and [`api.md`](../../apps/fil-app/src/content/api.md) content pages

## Open questions

- Which hostname does the MCP server use? It depends on the product name and domain, which are still [open](README.md#open-questions).
- Who adds the DNSimple records for `filecoin.io`, and who keeps them in place?
