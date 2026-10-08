# Agents

Pick the way in that matches what your agent can do. In every case, a person owns the wallet and approves what the agent may do, and the agent never holds the wallet key.

| Agent | What it can do | Way in |
| --- | --- | --- |
| Local agent, such as Claude Code, Codex, or Cursor | Run a shell, keep files, and open pages for you | [Plugin, or CLI and agent skill](#local-agents) |
| Cloud agent, such as a coding agent in a hosted sandbox | Run a shell, but its files are gone when the session ends | [CLI with a key from secrets](#cloud-agents) |
| Browser agent | Read and use web pages in the browser that holds your wallet | [fil-app's WebMCP tools](#browser-agents) |
| Chat app with connectors, such as Claude or ChatGPT | Call remote tools | [MCP server](#mcp-server), read-only |

[Retrieve and verify](/docs/retrieve) compares what each way can store, retrieve, and check.

## Local agents

In Claude Code and Codex, install the fil plugin. It adds the agent skill and the read-only [MCP server](#mcp-server) in one step. In Claude Code:

```sh
claude plugin marketplace add hugomrdias/fil
claude plugin install fil@fil
```

In Codex:

```sh
codex plugin marketplace add hugomrdias/fil
codex plugin add fil@fil
```

The plugin follows the [Agent Plugins](https://agent-plugins.org) format, so other agents that support it can load it from the repository's [`plugins/fil`](https://github.com/hugomrdias/fil/tree/main/plugins/fil) directory.

In other agents, install the agent skill. It tells the agent when to use `fil`, the workflow, and the rules, and points it to the CLI's own help, which always matches the installed version:

```sh
npx skills add https://fil-app.hugomrdias.dev
```

`npx skills add hugomrdias/fil` installs the same skill from GitHub. Agents that support [agent skills discovery](https://github.com/cloudflare/agent-skills-discovery-rfc) find it at [`/.well-known/agent-skills/index.json`](/.well-known/agent-skills/index.json).

The agent runs the CLI with `npx -y @hugomrdias/fil`, which needs Node.js 24 or newer. To install it instead, run `npm install -g @hugomrdias/fil`. Then `fil skills install` installs the copy of the skill that matches the installed CLI.

The first `fil login` asks you to [approve the agent's key](#approve-the-agents-key).

## Cloud agents

A cloud agent has a shell, so it uses the same skill and CLI as a local agent. It has no browser to open for you, and its disk is gone when the session ends. `fil login` saves the session key on that disk, so each session would ask you to approve a new key.

Give the agent a key that outlives the session instead:

1. On the fil-app [session keys page](https://fil-app.hugomrdias.dev/dashboard/session-keys), generate a session key, authorize it, and export it.
2. In the agent's environment settings, add the key as the secret `FIL_SESSION_KEY`, and your wallet address as `FIL_ROOT_ADDRESS`.

`fil` then skips `fil login`, and `fil status` confirms the key works. The key cannot move funds, and it expires. Revoke it on the same page to stop the agent. Never paste the key into a chat.

`fil ls` and `fil operations` read a local database, which a new session starts without. [Find stored content](/docs/retrieve#find-stored-content) shows how to look it up by wallet.

## Browser agents

fil-app registers [WebMCP](https://webmachinelearning.github.io/webmcp/) tools. A browser agent can prepare a setup request without building a URL, and read the account, its data sets and pieces, and its session keys. The tools never sign anything, and they describe themselves to the agent. [Web app](/docs/app#webmcp-tools) lists them. WebMCP is an early preview that works in Chrome 149 and later. Without it, the agent opens a [setup link](/docs/app#setup-links).

A browser agent cannot run the CLI. You can store files from the dashboard's upload page while it watches, and a folder's link verifies in the browser.

## MCP server

fil-api's MCP server gives any agent read-only tools for storage providers, data sets, pieces, Filecoin Pay rails, and session keys, on mainnet and calibration. It uses Streamable HTTP and needs no authentication. It cannot store or delete content.

```text
https://fil-api.hugomrdias.dev/mcp
```

The [fil plugin](#local-agents) adds it in Claude Code and Codex. To add the server alone, [add-mcp](https://github.com/neon-solutions/add-mcp) writes it into the configuration of Claude Code, Codex, Cursor, VS Code, and about 20 other agents:

```sh
npx -y add-mcp https://fil-api.hugomrdias.dev/mcp
```

It asks which agents to configure, and adds the server to the current project. Add `-g` to add it for your user instead.

Claude Code and Codex also add it with their own commands:

```sh
claude mcp add --transport http fil-api https://fil-api.hugomrdias.dev/mcp
codex mcp add fil-api --url https://fil-api.hugomrdias.dev/mcp
```

In the Claude and ChatGPT apps, add the URL as a custom connector. [REST API and MCP server](/docs/api#mcp-server) lists the tools.

## Approve the agent's key

The agent never holds the wallet key. It gets a session key instead, and the wallet owner approves it:

1. The agent runs `fil login`. It gets a `login_pending` error with an approval link, and relays the link to you.
2. You open the link, connect your wallet, and review the request on the fil-app setup page. Approve the session key, the Warm Storage approval, and a USDFC deposit if the page asks for them.
3. The agent runs `fil login` again to confirm, then `fil put`.

When the account runs low, `fil status` and `fil put` return `insufficient_funds` with a prefilled funding link for you. To stop the agent, revoke its key on the fil-app [session keys page](https://fil-app.hugomrdias.dev/dashboard/session-keys).

## Discovery files

This site describes itself to agents:

| Path | Contents |
| --- | --- |
| [`/llms.txt`](/llms.txt) | An index of these docs in Markdown, from [llmstxt.org](https://llmstxt.org) |
| [`/llms-full.txt`](/llms-full.txt) | Every docs page in one Markdown file |
| [`/.well-known/api-catalog`](/.well-known/api-catalog) | Links to fil-api's OpenAPI document, reference, and MCP server, as an [RFC 9727](https://www.rfc-editor.org/rfc/rfc9727) API catalog |
| [`/.well-known/integrations.json`](/.well-known/integrations.json) | The REST API, the MCP server, and the CLI, with what each needs to authenticate, for [integrations.sh](https://integrations.sh) |
| [`/.well-known/mcp/server-card.json`](/.well-known/mcp/server-card.json) | The MCP server card, also at `/.well-known/mcp-server-card` |
| [`/.well-known/agent-skills/index.json`](/.well-known/agent-skills/index.json) | The agent skills index, with the `fil` skill |
| [`/sitemap.xml`](/sitemap.xml) | Every page, also linked from `/robots.txt` |

Every docs page also has a Markdown version. Add `.md` to the path, such as [`/docs/cli.md`](/docs/cli.md), or send `Accept: text/markdown`:

```sh
curl -H 'Accept: text/markdown' https://fil-app.hugomrdias.dev/docs/cli
```

A request that accepts only Markdown gets a Markdown answer from every page. A missing page returns `404` with links to `llms.txt` and the sitemap. An explorer or dashboard page, which has no Markdown version, returns `406`.
