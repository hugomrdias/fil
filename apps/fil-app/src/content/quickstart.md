# Quickstart

This guide builds `fil`, logs in, stores a file, and downloads it again. It uses the calibration test network, so storage is paid with test USDFC.

You need:

- Node.js 24 or newer and pnpm 11.
- A browser wallet, such as MetaMask, with calibration FIL for gas and test USDFC. The [Filecoin docs](https://docs.filecoin.cloud/) list the faucets.

## Build the CLI

`fil` is not published yet, so build it from source:

```sh
git clone https://github.com/hugomrdias/fil.git
cd fil
pnpm install --frozen-lockfile
pnpm turbo run build --filter=fil-cli
alias fil="node $PWD/packages/fil-cli/bin/fil.js"
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

The result includes two links:

- `urls.browser` is the link to share. A browser renders a file from it, and a folder through [inbrowser.link](https://inbrowser.link).
- `urls.piece` returns the exact stored bytes.

A new piece link returns 404 until the indexer behind fil-api has the piece. A folder's browser link works at once. `fil inspect <ref> --check` reports when it answers.

## Get it back

```sh
fil ls
fil get res_… --output ./copy.pdf
```

`fil get` downloads from the provider and checks the bytes against the PieceCID.

## Next

- [CLI](/docs/cli) covers every command, the JSON output, and the error codes.
- [Agent setup](/agents) shows how to give an agent the same access.
