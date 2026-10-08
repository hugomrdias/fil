# fil

`fil` stores files and folders on [Filecoin](https://docs.filecoin.cloud/) and returns links you can share. People run it in a terminal, and agents run it in a shell. Every command writes one JSON result that an agent can act on.

This is a prototype. It runs on the calibration test network unless you choose mainnet.

## Ways to use it

- **CLI.** `fil put ./site` stores a folder and returns a browser link. `fil get` downloads and verifies it. See the [CLI docs](/docs/cli).
- **MCP server.** `https://fil-api.hugomrdias.dev/mcp` gives agents read-only tools for providers, data sets, pieces, payment rails, and session keys. See [API and MCP](/docs/api).
- **Web app.** [fil-app](https://fil-app.hugomrdias.dev) is an explorer for that data and a wallet dashboard for funding storage and approving keys. See [Web app](/docs/app).

## How an agent gets access

The agent never holds the wallet key. It gets a session key, which the wallet owner approves in fil-app and which cannot move funds. [Agents](/agents) shows the way in for each kind of agent: local, cloud, browser, or chat app.

## Start

- [Quickstart](/docs/quickstart): install the CLI, log in, and store a file.
- [Agents](/agents): add `fil` to Claude, ChatGPT, or another agent.
- [Source code](https://github.com/hugomrdias/fil) on GitHub.
