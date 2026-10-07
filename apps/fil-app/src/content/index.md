# fil

`fil` stores files and folders on [Filecoin](https://docs.filecoin.cloud/) and returns links you can share. People run it in a terminal, and agents run it in a shell. Every command writes one JSON result that an agent can act on.

This is a prototype. It runs on the calibration test network unless you choose mainnet.

## Ways to use it

- **CLI.** `fil put ./site` stores a folder and returns a browser link. `fil get` downloads and verifies it. See the [CLI docs](/docs/cli).
- **MCP server.** `https://fil-api.hugomrdias.dev/mcp` gives agents read-only tools for providers, data sets, pieces, payment rails, and session keys. See [REST API and MCP server](/docs/api).
- **Web app.** [fil-app](https://fil-app.hugomrdias.dev) is an explorer for that data and a wallet dashboard for funding storage and approving keys. See [Web app](/docs/app).

## How an agent gets access

1. The agent runs `fil login`. The CLI makes a session key on the agent's machine and returns an approval link.
2. The wallet owner opens the link in fil-app, reviews the request, and approves it with their wallet. The same page can deposit USDFC to pay for storage.
3. The agent runs `fil put`. The session key signs the storage request, and the wallet pays for it. The agent never holds the wallet key.

[Agent setup](/agents) covers the skill, the MCP server, and the discovery files.

## Start

- [Quickstart](/docs/quickstart): build the CLI, log in, and store a file.
- [Agent setup](/agents): add `fil` to Claude, ChatGPT, or another agent.
- [Source code](https://github.com/hugomrdias/fil) on GitHub.
