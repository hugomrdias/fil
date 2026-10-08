# Agent setup

An agent can use `fil` in three ways. It can run the CLI in a shell to store and retrieve content, call the MCP server to read Filecoin data, and use fil-app's WebMCP tools in a browser. In every case, a person owns the wallet and approves what the agent may do.

## When to use fil

Reach for fil when an agent needs to:

- Store a file or a folder on Filecoin and get a link to share it: run `fil put` in a shell.
- Download content it stored and verify it: run `fil get`.
- Read Filecoin data, such as storage providers, data sets, pieces, Filecoin Pay rails, and session keys, on mainnet or calibration: call the MCP server or the REST API.
- Help a person fund storage or approve the agent's key in a browser: use fil-app's WebMCP tools.

## Install the CLI and the skill

Build the CLI by following the [Quickstart](/docs/quickstart), then install the agent skill in your project:

```sh
fil skills install
```

The command copies the `fil` skill into `.agents/skills` and `.claude/skills`. The skill teaches the agent the workflow, to branch on `error.code`, and never to repeat a paid command.

To install the skill without the CLI, use the [`skills` CLI](https://github.com/vercel-labs/skills) with the repository or this site:

```sh
npx skills add hugomrdias/fil
npx skills add https://fil-app.hugomrdias.dev
```

Agents that support [agent skills discovery](https://github.com/cloudflare/agent-skills-discovery-rfc) can also find the skill at [`/.well-known/agent-skills/index.json`](/.well-known/agent-skills/index.json).

## Approve the agent's key

The agent never holds the wallet key. It gets a session key instead, and the wallet owner approves it:

1. The agent runs `fil login`. It gets a `login_pending` error with an approval link, and relays the link to you.
2. You open the link, connect your wallet, and review the request on the fil-app setup page. Approve the session key, the Warm Storage approval, and a USDFC deposit if the page asks for them.
3. The agent runs `fil login` again to confirm, then `fil put`.

When the account runs low, `fil status` and `fil put` return `insufficient_funds` with a prefilled funding link for you. To stop the agent, revoke its key on the fil-app [session keys page](https://fil-app.hugomrdias.dev/dashboard/session-keys).

## Add the MCP server

fil-api's MCP server gives agents read-only tools for storage providers, data sets, pieces, Filecoin Pay rails, and session keys, on mainnet and calibration. It uses Streamable HTTP and needs no authentication.

```text
https://fil-api.hugomrdias.dev/mcp
```

In Claude Code:

```sh
claude mcp add --transport http fil-api https://fil-api.hugomrdias.dev/mcp
```

In Codex:

```sh
codex mcp add fil-api --url https://fil-api.hugomrdias.dev/mcp
```

In the Claude and ChatGPT apps, add the URL as a custom connector. The server cannot store or delete content. Use the CLI for that.

[REST API and MCP server](/docs/api#mcp-server) lists the tools.

## Use fil-app from a browser agent

fil-app registers [WebMCP](https://webmachinelearning.github.io/webmcp/) tools. A browser agent can prepare a setup request without building a URL, and read the account, its data sets and pieces, and its session keys. The tools never sign anything. WebMCP is an early preview that works in Chrome 149 and later. [Web app](/docs/app#webmcp-tools) lists the tools.

## Rules for agents

- Never ask for or pass a private key. Relay the approval link to the user and stop.
- Never repeat a failed or interrupted `put` or `delete`, because that starts a new paid operation. Run the `fil operations resume <id>` step from `next` instead.
- `fil delete` needs `--yes`. Pass it only after the user agrees.
- Retry only when `error.retryable` is `true`.
- Check flags with `fil schema <command>` instead of guessing.

## Discovery files

This site describes itself to agents:

| Path | Contents |
| --- | --- |
| [`/llms.txt`](/llms.txt) | An index of these docs in Markdown, from [llmstxt.org](https://llmstxt.org) |
| [`/llms-full.txt`](/llms-full.txt) | Every docs page in one Markdown file |
| [`/.well-known/api-catalog`](/.well-known/api-catalog) | Links to fil-api's OpenAPI document and reference, as an [RFC 9727](https://www.rfc-editor.org/rfc/rfc9727) API catalog |
| [`/.well-known/mcp/server-card.json`](/.well-known/mcp/server-card.json) | The MCP server card, also at `/.well-known/mcp-server-card` |
| [`/.well-known/agent-skills/index.json`](/.well-known/agent-skills/index.json) | The agent skills index, with the `fil` skill |
| [`/sitemap.xml`](/sitemap.xml) | Every page, also linked from `/robots.txt` |

Every docs page also has a Markdown version. Add `.md` to the path, such as [`/docs/cli.md`](/docs/cli.md), or send `Accept: text/markdown`:

```sh
curl -H 'Accept: text/markdown' https://fil-app.hugomrdias.dev/docs/cli
```

A request that accepts only Markdown gets a Markdown answer from every page. A missing page returns `404` with links to `llms.txt` and the sitemap. An explorer or dashboard page, which has no Markdown version, returns `406`.
