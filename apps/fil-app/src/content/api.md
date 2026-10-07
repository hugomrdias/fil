# REST API and MCP server

[fil-api](https://fil-api.hugomrdias.dev) serves read-only Filecoin data: storage providers, data sets, pieces, Filecoin Pay rails, and session keys. It reads from an indexer of the Filecoin chain, so its data trails the chain. `/health` reports the latest indexed block. It cannot store, delete, or sign anything.

The interactive reference is at [`/docs`](https://fil-api.hugomrdias.dev/docs), and the OpenAPI 3.1 document is at [`/openapi.json`](https://fil-api.hugomrdias.dev/openapi.json).

## Routes

| Route | Description |
| --- | --- |
| `GET /openapi.json` | OpenAPI 3.1 document |
| `GET /docs` | API reference |
| `POST /mcp` | MCP server (Streamable HTTP, stateless) |
| `GET /health` | Latest indexed block per network and indexer |
| `GET /get/{cid}` | Redirect to where a PieceCID or IPFS root CID can be retrieved |

Every data route starts with the network: `/calibration/...` or `/mainnet/...`.

| Route | Filters |
| --- | --- |
| `/{network}/status` | none |
| `/{network}/providers` | `approved`, `active`, `endorsed` |
| `/{network}/providers/{providerId}` | none |
| `/{network}/data-sets` | `owner`, `provider_id`, `deleted`, `with_cdn` |
| `/{network}/data-sets/{dataSetId}` | none |
| `/{network}/data-sets/{dataSetId}/pieces` | `removed` |
| `/{network}/data-sets/{dataSetId}/pieces/{pieceId}` | none |
| `/{network}/pieces` | `owner`, `cid` (a PieceCID v2), `provider_id`, `removed`. At least one of the first three is required |
| `/{network}/rails` | `payer`, `payee`, `operator`, `token`, `state` (`active`, `terminated`, or `finalized`) |
| `/{network}/rails/{railId}` | none |
| `/{network}/rails/{railId}/settlements` | none |
| `/{network}/session-keys` | `identity`, `signer`, `active` |
| `/{network}/session-keys/history` | `identity`, `signer` |

Conventions:

- **Owner** is the address that pays for a data set.
- **Big numbers**, such as IDs, amounts, and epochs, are decimal strings.
- **Pagination** uses `limit` (1 to 200, default 50) and an opaque `cursor`. Each response looks like `{ data, nextCursor }`.
- **Errors** look like `{ error: { code, message } }`.
- **Operation IDs**, such as `listDataSets` and `retrieve`, name every operation in the OpenAPI document, for function calling and generated clients.

## Retrieval

`GET /get/{cid}?network=mainnet&browser=false` redirects to where the content can be fetched. It never proxies the bytes. `network` defaults to `mainnet`.

| CID | `browser` | Redirect |
| --- | --- | --- |
| PieceCID v2 (`bafkzcib…`) | `false` or absent | The provider's `/piece/{cid}` |
| PieceCID v2 (`bafkzcib…`) | `true` | `https://inbrowser.link/ipfs/{root}` when the piece is a folder, otherwise the provider's `/piece/{cid}` |
| Other CID (IPFS content) | `false` or absent | The provider's `/ipfs/{cid}` |
| Other CID (IPFS content) | `true` | `https://inbrowser.link/ipfs/{cid}` |

Legacy v1 PieceCIDs (`baga…`) and strings that aren't CIDs return `400`. If no live copy exists, the response is `404`. When several providers store the content, the route prefers endorsed providers, then approved ones, then the oldest copy.

## MCP server

The MCP server at `https://fil-api.hugomrdias.dev/mcp` offers one read-only tool for each data route. Each tool requires a `network` argument.

| Tool | Reads |
| --- | --- |
| `get_status` | Indexer progress |
| `list_providers`, `get_provider` | Storage providers |
| `list_data_sets`, `get_data_set` | Data sets |
| `list_data_set_pieces`, `get_piece`, `list_pieces` | Pieces |
| `list_rails`, `get_rail`, `list_rail_settlements` | Filecoin Pay rails and settlements |
| `list_session_keys`, `list_session_key_events` | Session keys and their history |

[Agent setup](/agents#add-the-mcp-server) shows how to add it to an agent.

## Limits

- **Rate limits.** 120 requests a minute per IP for the REST API, and 60 for MCP. Over the limit, requests get `429` with `Retry-After`.
- **Caching.** Data reads are not cached by browsers, so every read returns the latest indexed data.
- **No authentication.** Every route is public and read-only.
