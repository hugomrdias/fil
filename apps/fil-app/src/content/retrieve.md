# Retrieve and verify

Everything `fil` stores has a PieceCID, and a folder also has a root CID:

- The **PieceCID** (`bafkzcib…`) identifies the exact stored bytes. The storage provider proves on chain that it still holds them.
- The **root CID** identifies a folder on IPFS. `fil` packs a folder into a UnixFS CAR, and the PieceCID covers that CAR.

`fil put` returns two links on fil-api's [`/get/{cid}` route](/docs/api#retrieval), which redirects to a provider that stores the content:

- `urls.browser` is the link to share. A browser renders a file straight from the provider, and opens a folder through [inbrowser.link](https://inbrowser.link).
- `urls.piece` returns the exact stored bytes.

fil-api finds providers through its indexer, so a new piece link returns 404 until the indexer has the piece. A folder's browser link works at once. `fil inspect <ref> --check` reports when the piece link answers.

## What each way checks

| Way | Who can use it | Gets | Checks |
| --- | --- | --- | --- |
| `fil get <ref>` | Agents with a shell, and people | A file, or the folder, extracted | The bytes against the PieceCID, and for a folder the root CID. On a mismatch it keeps nothing and fails with `verification_failed` |
| `fil get <PieceCID>` | Agents with a shell, and people | The stored bytes as one file. For a folder, that is the CAR | The bytes against the PieceCID |
| A folder's `urls.browser` | Browser agents, and people | The folder, rendered | Each block, in the browser |
| A file's `urls.browser`, or `urls.piece` | Anything that speaks HTTP | The bytes | Nothing |

Use `fil get` when the content must be intact. When you hand over a link that checks nothing, say so.

## Find stored content

`fil ls` lists what this machine stored. The list lives in a local database, so a new machine, or a cloud sandbox that was reset, starts empty. The content is still on Filecoin, under the wallet that paid for it:

- In a browser, the dashboard's data sets page, or the WebMCP tools `list_data_sets` and `list_pieces`.
- Over MCP, `list_pieces` with the wallet as `owner`. Over HTTP, `GET /{network}/pieces?owner=<wallet>` on fil-api.

Each piece comes with a retrieval link. `fil get <PieceCID>` downloads and checks one with the same wallet's session key.

## Store without the CLI

The dashboard's [upload page](/dashboard/upload) stores files in one of the wallet's data sets. The wallet signs each step, so a person must be at the browser. It stores files, not folders. The MCP server and the REST API cannot store anything.
