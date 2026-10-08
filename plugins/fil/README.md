# fil plugin

The fil plugin adds `fil` to an agent in one install. It bundles the [agent skill](skills/fil/SKILL.md), which teaches the agent to store, share, retrieve, and verify content with the `fil` CLI, and connects fil-api's read-only [MCP server](../../apps/fil-api/README.md). The skill runs the CLI from npm, so the plugin carries no code.

The plugin follows the [Agent Plugins](https://agent-plugins.org/specification) 1.0.0 format and also carries a Claude Code manifest. Every client reads the same `skills/` directory:

| File | Contents | Read by |
| --- | --- | --- |
| [`plugin.json`](plugin.json) | The portable manifest. `extensions.com.openai` holds the Codex and ChatGPT listing. | Agent Plugins clients, such as Codex |
| [`mcp.json`](mcp.json) | fil-api's MCP server, over Streamable HTTP | Agent Plugins clients |
| [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json) | The same metadata and MCP server in Claude Code's format, which names the transport `http` | Claude Code |
| [`assets/logo.png`](assets/logo.png) | The Filecoin logo, rendered from fil-app's favicon | Codex and Anthropic's plugin directory |
| [`skills/`](skills) | The agent skills. This is their only source: the fil-cli build copies them for `fil skills install`, and fil-app publishes them under `/.well-known/agent-skills/`. | Every client |

The repository root is the marketplace for both clients. [`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json) lists the plugin for Claude Code. `npx skills add hugomrdias/fil` finds the skills through the entry's `skills` list, so a new skill must be added there too; `pnpm check:plugin` fails until it is. [`.agents/plugins/marketplace.json`](../../.agents/plugins/marketplace.json) lists it for Codex.

## Install

Each client adds this repository as a marketplace from GitHub, then installs the plugin from it.

In Claude Code:

```sh
claude plugin marketplace add hugomrdias/fil
claude plugin install fil@fil
```

In Codex:

```sh
codex plugin marketplace add hugomrdias/fil
codex plugin add fil@fil
```

The MCP server needs no sign-in. Ask the agent to store or share a file on Filecoin, and it loads the skill. In Claude Code, `/fil:fil` also invokes it. If you added fil-api as a standalone MCP server before, remove it, so the agent has one copy of its tools.

Another Agent Plugins client loads the `plugins/fil` directory as it is. Claude and ChatGPT on the web don't install local plugins; add `https://fil-api.hugomrdias.dev/mcp` as a custom connector there instead, which gives the MCP tools without the skill.

## Versions

release-please releases the plugin as the `fil-plugin` component and writes each version into both manifests. Claude Code keeps an installed plugin at its version until the version changes, so a change to the skill reaches its users with the next release, not with each commit. `pnpm check:plugin` fails when the two manifests disagree.

## Develop

From the repository root, check the manifests with each client's rules:

```sh
pnpm check:plugin
claude plugin validate ./plugins/fil
claude plugin validate .
```

Load the plugin in Claude Code without installing it:

```sh
claude --plugin-dir ./plugins/fil
```

Install it in Codex from the checkout, and start a new session after each change:

```sh
codex plugin marketplace add .
codex plugin add fil@fil
```

On 2026-10-08, Claude Code 2.1.289 and the Codex CLI 0.161.0 installed the plugin from a local checkout, listed the `fil` skill and the 13 fil-api tools, and called `get_status` on calibration. The desktop apps are not verified yet.
