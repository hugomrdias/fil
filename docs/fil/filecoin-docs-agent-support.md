# Agent support on docs.filecoin.io

Research date: 2026-10-14. Audience: the Filecoin docs team. Scope: what [docs.filecoin.io](https://docs.filecoin.io) gives AI agents through GitBook, what is missing compared with [fil-app](../../apps/fil-app/README.md#website), and what GitBook lets the team change. Checks were made with `curl` against the live site. We had no access to the site's GitBook settings.

## Summary

docs.filecoin.io already covers the basics agents need: `llms.txt`, `llms-full.txt`, Markdown at `.md` URLs and through `Accept: text/markdown`, a sitemap, and a hosted MCP server. The gaps are discovery files under `/.well-known/`, a few HTTP details, and one broken endpoint: the `?ask=` query that every Markdown page advertises returns `500`.

GitBook's settings only turn its built-in features on and off. It cannot serve custom files, set response headers, or run custom code. Closing the remaining gaps needs a proxy, such as a Cloudflare Worker, in front of GitBook.

Recommended next steps:

1. Ask GitBook why `?ask=` returns `500`, and either enable GitBook Assistant or get the agent instructions removed from the Markdown pages.
2. Ask GitBook to add `Accept` to the `Vary` header and to return `404` for missing pages in Markdown.
3. Check the **Agents & MCP** report in site analytics to see how much agent traffic the docs get before deciding on a proxy.

## What works today

| Feature | URL or behavior |
| --- | --- |
| [llms.txt](https://llmstxt.org) index | [`/llms.txt`](https://docs.filecoin.io/llms.txt), about 38 KB, links each page's `.md` URL |
| Full text in one file | [`/llms-full.txt`](https://docs.filecoin.io/llms-full.txt), about 637 KB |
| Markdown per page | Append `.md`, for example [`/getting-started/what-is-filecoin.md`](https://docs.filecoin.io/getting-started/what-is-filecoin.md). `/index.md` works for the home page |
| Content negotiation | `Accept: text/markdown` on a page URL returns the same Markdown as `.md`. `Accept: text/html` returns HTML |
| Markdown link in HTML | `<link rel="alternate" type="text/markdown">` in each page's `<head>` |
| Self-describing Markdown | Each `.md` page starts with a note pointing to `llms.txt` and the `.md` convention, and ends with agent instructions for `?ask=` |
| Sitemaps | [`/sitemap.xml`](https://docs.filecoin.io/sitemap.xml), `/sitemap-pages.xml`, and [`/sitemap.md`](https://docs.filecoin.io/sitemap.md) |
| `robots.txt` | Allows all crawlers, links the sitemap, and sends `Content-Signal: ai-train=yes, search=yes, ai-input=yes` |
| MCP server | `https://docs.filecoin.io/~gitbook/mcp`, Streamable HTTP. Tools: `searchDocumentation`, `getPage`, `askQuestion`, `sendFeedback` |
| MCP server card | [`/.well-known/mcp/server-card.json`](https://docs.filecoin.io/.well-known/mcp/server-card.json) |
| SEO metadata | Canonical URL and Open Graph tags |

`sendFeedback` lets agents report outdated or wrong content to the docs team. Check where those reports arrive in GitBook.

## Gaps compared with fil-app

fil-app serves these files and behaviors. See its [README](../../apps/fil-app/README.md#website) for details.

| fil-app feature | docs.filecoin.io |
| --- | --- |
| `/.well-known/api-catalog` ([RFC 9727](https://www.rfc-editor.org/rfc/rfc9727)) | `404` |
| `/.well-known/integrations.json` ([integrations.sh](https://integrations.sh/publishing/)) | `404` |
| `/.well-known/mcp-server-card` alias | `404`. Only `/.well-known/mcp/server-card.json` exists |
| `/.well-known/agent-skills/index.json` ([agent skills discovery](https://github.com/cloudflare/agent-skills-discovery-rfc)) | `404` |
| `Vary: Accept` on HTML responses | Missing |
| `Link` HTTP header to the Markdown version | Missing. The `<link>` tag in `<head>` covers clients that parse HTML |
| Markdown `404` for a missing page | Returns `200` with a "Page Not Found" Markdown body |
| Markdown `406` when a client accepts neither HTML nor Markdown | `Accept: application/json` gets HTML with `200` |
| JSON-LD | None |
| [WebMCP](https://webmachinelearning.github.io/webmcp/) tools | GitBook's page bundle has a `WebMCP` component. Which tools it registers is not verified |

The API catalog and integrations file describe an API. They matter only if Filecoin wants to list APIs, such as the Lotus JSON-RPC, from the docs domain.

## Issues found

- **`?ask=` returns `500`.** Every `.md` page ends with GitBook's agent instructions: send `GET <page>.md?ask=<question>&goal=<goal>` for an answer. On docs.filecoin.io this returns `500` after about 3.5 seconds. The same request on [gitbook.com/docs](https://gitbook.com/docs/getting-started/llm-ready-docs.md) returns `200` with Markdown. GitBook Assistant is probably off for this site or plan. Agents follow these instructions, so each failed call costs them a request and a retry.
- **`Vary` omits `Accept`.** The HTML and Markdown versions share a URL but the response does not say it varies by `Accept`. GitBook's own edge served the right version in our tests, but a shared cache between the client and GitBook can return the wrong one. Agents should prefer `.md` URLs until this is fixed.
- **Missing pages return `200` in Markdown.** With `Accept: text/markdown`, a missing page returns `200` with suggested pages. Agents and link checkers treat it as a real page. The HTML version returns `404`.

## What GitBook settings control

Site customization → Configuration → **Page actions** has these options, per [GitBook's docs](https://gitbook.com/docs/manage-your-site/customization/extra-configuration.md):

| Setting | Effect |
| --- | --- |
| Page actions | Shows the page menu. Turning it off also disables `/~gitbook/mcp`, which then returns `404` |
| Open in AI providers | Adds actions that open the page in ChatGPT or Claude |
| Copy/View as Markdown | Adds actions that copy or open the page's Markdown |
| Connect with MCP server | Shows the MCP URL in the menu. It does not turn the server on or off |

GitBook makes `.md` pages, `llms.txt`, `llms-full.txt`, content negotiation, sitemaps, and `robots.txt` [automatically](https://gitbook.com/docs/getting-started/llm-ready-docs.md), with no settings.

GitBook has no setting to serve custom files, set response headers, or change status codes. Its FAQ says custom CSS, HTML, or JavaScript cannot be inserted into a site, which rules out JSON-LD and custom WebMCP tools.

## Options to close the gaps

### Site redirects (partial, untested)

Site settings → Redirects can send any path to an external URL with `307` or `308` ([docs](https://gitbook.com/docs/publish/site-redirects.md)). The team could redirect `/.well-known/...` paths to JSON files hosted elsewhere, such as a GitHub repository.

Limits:

- GitBook's docs do not say whether it accepts `/.well-known/` source paths.
- Some discovery clients do not follow redirects.
- Redirects add no headers and fix none of the issues above.

### A Cloudflare Worker in front of GitBook (full)

GitBook documents a [Cloudflare Worker proxy](https://gitbook.com/docs/publish/custom-domain/setting-a-custom-subdirectory/configuring-a-subdirectory-with-cloudflare.md) for hosting docs under a subdirectory. A Worker on the docs hostname could serve the `/.well-known/` files, add `Vary: Accept` and `Link` headers, fix the status codes, and inject JSON-LD with HTMLRewriter.

Blockers:

- docs.filecoin.io is a CNAME to `2821909c24-hosting.gitbook.io`, and `filecoin.io` uses DNSimple nameservers. A Worker on this hostname needs the zone on Cloudflare.
- GitBook documents the proxy for a subdirectory, such as `example.com/docs`, not for a whole hostname. Confirm with GitBook that proxying a root custom domain is supported.

## Questions for GitBook

- Why does `?ask=` return `500` on docs.filecoin.io? Does it need GitBook Assistant or a higher plan? If it stays off, can the agent instructions be dropped from the `.md` pages?
- Can the HTML responses send `Vary: Accept` and a `Link` header to the Markdown version?
- Can a missing page return `404` when requested as Markdown?
- Can the MCP server card also be served at `/.well-known/mcp-server-card`?
- Do site redirects accept `/.well-known/` source paths?
- Is a Cloudflare Worker proxy supported for a root custom domain?

## How to reproduce

```bash
# llms.txt and full text
curl -sI https://docs.filecoin.io/llms.txt
curl -sI https://docs.filecoin.io/llms-full.txt

# Markdown by suffix and by Accept header
curl -s https://docs.filecoin.io/getting-started/what-is-filecoin.md | head
curl -s -H "Accept: text/markdown" https://docs.filecoin.io/getting-started/what-is-filecoin | head

# Vary and Link headers on the HTML page
curl -sI https://docs.filecoin.io/getting-started/what-is-filecoin | grep -iE "^(vary|link):"

# Missing page in Markdown: status code
curl -s -o /dev/null -w "%{http_code}\n" -H "Accept: text/markdown" https://docs.filecoin.io/nope

# ?ask= endpoint
curl -s -o /dev/null -w "%{http_code}\n" "https://docs.filecoin.io/welcome.md?ask=what%20is%20filecoin&goal=learn"

# Discovery files
for p in api-catalog integrations.json mcp/server-card.json mcp-server-card agent-skills/index.json; do
  curl -s -o /dev/null -w "$p %{http_code}\n" "https://docs.filecoin.io/.well-known/$p"
done

# MCP server
curl -s -X POST https://docs.filecoin.io/~gitbook/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# DNS
dig +short CNAME docs.filecoin.io
dig +short NS filecoin.io
```
