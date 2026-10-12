# Quickstart

This guide installs `fil`, logs in, stores a file, and downloads it again. It uses the calibration test network, so storage is paid with test USDFC.

You need:

- Node.js 24 or newer.
- A browser wallet, such as MetaMask, with calibration FIL for gas and test USDFC. The [Filecoin docs](https://docs.filecoin.cloud/) list the faucets.

## Hand it to an agent

Add fil to your agent, then ask it to store a file. On its first run, the agent sends you a link to approve its key with your wallet. [Agents](/agents) covers cloud and browser agents.

<!-- tabs -->

### Install the plugin

```sh
claude plugin marketplace add hugomrdias/fil
claude plugin install fil@fil

# In Codex
codex plugin marketplace add hugomrdias/fil
codex plugin add fil@fil
```

Adds the agent skill and the read-only MCP server to Claude Code or Codex.

### Install the agent skill

```sh
npx skills add https://fil-app.hugomrdias.dev
```

Teaches any agent with a shell when and how to run `fil`.

### Connect the MCP server

```sh
npx -y add-mcp https://fil-api.hugomrdias.dev/mcp -g
```

Read-only tools for providers, data sets, and pieces. It cannot store files.

<!-- /tabs -->

To do it yourself, follow the steps below.

## Install the CLI

```sh
npm install -g @hugomrdias/fil
fil --help
```

## Log in

```sh
fil login
```

`fil login` makes a session key, saves it on your machine, and opens the fil-app setup page. Connect your wallet there, review the request, and approve each step. The page can also approve Warm Storage and deposit USDFC. The private key never leaves your machine, and the CLI finds the approval on chain, so there is nothing to copy back.

Then check the account:

```sh
fil status
```

`fil status` reports when each permission expires, your USDFC funds, and the Warm Storage approval. If the account needs a deposit, it also returns a funding link.

## Store a file

Check the size, provider, and cost first. A dry run stores nothing:

```sh
fil put ./report.pdf --dry-run
```

Then store it:

```sh
fil put ./report.pdf
```

The result's `urls.browser` is the link to share. A new link to a file can return 404 for a while. [Retrieve and verify](/docs/retrieve) explains why, and what each link checks.

## Get it back

```sh
fil ls
fil get res_… --output ./copy.pdf
```

`fil get` downloads from the provider and checks the bytes against the PieceCID.

## Next

- [CLI](/docs/cli) explains how `fil` works and where its help and schemas are.
- [Agents](/agents) shows how to give an agent the same access.
