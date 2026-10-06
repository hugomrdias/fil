import { getAccountSummary } from '@filoz/synapse-core/pay'
import { getUploadCosts } from '@filoz/synapse-core/warm-storage'
import { useConfig, useConnection } from 'wagmi'
import type { z } from 'zod'
import { env } from '@/config/env'
import { useExplorerNetwork } from '@/hooks/use-explorer-network'
import { useWebMcpTool } from '@/hooks/use-webmcp-tool'
import { api, unwrap } from '@/lib/api/client'
import { CHAINS } from '@/lib/networks'
import {
  accountSummaryInput,
  accountSummaryResult,
  DEFAULT_LIMIT,
  dataSetResult,
  listDataSetsInput,
  listPiecesInput,
  listSessionKeysInput,
  lookupPieceInput,
  pieceResult,
  type ResultLinks,
  sessionKeyResult,
} from '@/lib/read-tools'
import { parseToolInput, toInputSchema } from '@/lib/webmcp'

/** Piece size `get_account_summary` prices to tell whether an upload is funded. */
const PROBE_SIZE = 1n << 20n

/**
 * Parse a tool's input, run the read, and return its result. Bad input and
 * failed reads come back as `{ ok: false, errors }` instead of throwing, so
 * the agent can correct the call.
 *
 * @param schema - Input schema.
 * @param input - Input the agent sent.
 * @param read - Reads and returns the result for the parsed input.
 */
async function runTool<Schema extends z.ZodObject, Result extends object>(
  schema: Schema,
  input: unknown,
  read: (data: z.output<Schema>) => Promise<Result>
) {
  const parsed = parseToolInput(schema, input)
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors }
  }
  try {
    return { ok: true, ...(await read(parsed.data)) }
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
}

/**
 * Read-only WebMCP tools available on every page: the Filecoin Pay account,
 * data sets, pieces, PieceCID lookup, and session keys. They read fil-api
 * and the chain, and never sign or send anything. Tools that take a wallet
 * default to the connected one.
 *
 * @see https://webmachinelearning.github.io/webmcp/
 */
export function WebMcpReadTools() {
  const config = useConfig()
  const connection = useConnection()
  const pageNetwork = useExplorerNetwork()
  const wallet =
    connection.status === 'connected'
      ? connection.address.toLowerCase()
      : undefined
  const links = (): ResultLinks => ({
    app: window.location.origin,
    api: env.filApiUrl,
  })

  /**
   * The wallet a tool reads: the one the agent passed, else the connected one.
   *
   * @param address - Address from the tool input.
   */
  const walletFor = (address: string | undefined) => {
    const value = address ?? wallet
    if (!value) {
      throw new Error(
        'No wallet is connected. Pass an address, or ask the user to connect their wallet.'
      )
    }
    return value
  }

  useWebMcpTool({
    name: 'get_account_summary',
    description:
      "Read a wallet's Filecoin Pay account: USDFC funds, available funds, debt, monthly spend and runway, whether Warm Storage is approved, and whether the wallet can pay for a new upload. When it cannot, the result has a setupUrl for the user. Read-only. Amounts are USDFC decimal strings.",
    inputSchema: toInputSchema(accountSummaryInput),
    annotations: { readOnlyHint: true },
    execute: (input) =>
      runTool(accountSummaryInput, input, async (data) => {
        const network = data.network ?? pageNetwork
        const address = walletFor(data.address) as `0x${string}`
        const client = config.getClient({ chainId: CHAINS[network].id })
        const [summary, costs] = await Promise.all([
          getAccountSummary(client, { address }),
          getUploadCosts(client, {
            clientAddress: address,
            pieceSizes: [PROBE_SIZE],
            isNewDataSet: true,
          }),
        ])
        return accountSummaryResult(
          { summary, costs },
          network,
          address,
          links()
        )
      }),
  })

  useWebMcpTool({
    name: 'list_data_sets',
    description:
      "List a wallet's Warm Storage data sets, with their provider, CDN setting and metadata. Use list_pieces to see what a data set holds. Read-only.",
    inputSchema: toInputSchema(listDataSetsInput),
    annotations: { readOnlyHint: true },
    execute: (input) =>
      runTool(listDataSetsInput, input, async (data) => {
        const network = data.network ?? pageNetwork
        const owner = walletFor(data.owner)
        const page = unwrap(
          await api.GET('/{network}/data-sets', {
            params: {
              path: { network },
              query: {
                owner,
                deleted: data.includeDeleted ? undefined : 'false',
                limit: data.limit ?? DEFAULT_LIMIT,
                cursor: data.cursor,
              },
            },
          })
        )
        return {
          network,
          owner,
          dataSets: page.data.map((dataSet) =>
            dataSetResult(dataSet, network, links())
          ),
          nextCursor: page.nextCursor,
        }
      }),
  })

  useWebMcpTool({
    name: 'list_pieces',
    description:
      'List the pieces in a data set, with their PieceCID, size, metadata, and a retrievalUrl that downloads each one. Read-only.',
    inputSchema: toInputSchema(listPiecesInput),
    annotations: { readOnlyHint: true },
    execute: (input) =>
      runTool(listPiecesInput, input, async (data) => {
        const network = data.network ?? pageNetwork
        const page = unwrap(
          await api.GET('/{network}/data-sets/{dataSetId}/pieces', {
            params: {
              path: { network, dataSetId: data.dataSetId },
              query: {
                removed: data.includeRemoved ? undefined : 'false',
                limit: data.limit ?? DEFAULT_LIMIT,
                cursor: data.cursor,
              },
            },
          })
        )
        return {
          network,
          dataSetId: data.dataSetId,
          pieces: page.data.map((piece) =>
            pieceResult(piece, network, links())
          ),
          nextCursor: page.nextCursor,
        }
      }),
  })

  useWebMcpTool({
    name: 'lookup_piece',
    description:
      'Find which data sets hold a PieceCID, with each owner and provider, and a retrievalUrl that downloads the piece. Takes a PieceCID v2 (bafkzcib…), not a legacy v1 PieceCID or an IPFS root CID. Read-only.',
    inputSchema: toInputSchema(lookupPieceInput),
    annotations: { readOnlyHint: true },
    execute: (input) =>
      runTool(lookupPieceInput, input, async (data) => {
        const network = data.network ?? pageNetwork
        const page = unwrap(
          await api.GET('/{network}/pieces', {
            params: {
              path: { network },
              query: {
                cid: data.cid,
                limit: data.limit ?? DEFAULT_LIMIT,
                cursor: data.cursor,
              },
            },
          })
        )
        return {
          network,
          cid: data.cid,
          found: page.data.length > 0,
          pieces: page.data.map((piece) =>
            pieceResult(piece, network, links())
          ),
          nextCursor: page.nextCursor,
        }
      }),
  })

  useWebMcpTool({
    name: 'list_session_keys',
    description:
      "List the session keys a wallet has authorized, with each permission's expiry and the name (origin) recorded on chain. Revoking a key needs a wallet transaction on the dashboard's session keys page. Read-only.",
    inputSchema: toInputSchema(listSessionKeysInput),
    annotations: { readOnlyHint: true },
    execute: (input) =>
      runTool(listSessionKeysInput, input, async (data) => {
        const network = data.network ?? pageNetwork
        const owner = walletFor(data.owner)
        const page = unwrap(
          await api.GET('/{network}/session-keys', {
            params: {
              path: { network },
              query: {
                identity: owner,
                active: data.includeExpired ? undefined : 'true',
                limit: data.limit ?? DEFAULT_LIMIT,
                cursor: data.cursor,
              },
            },
          })
        )
        return {
          network,
          owner,
          sessionKeys: page.data.map(sessionKeyResult),
          nextCursor: page.nextCursor,
        }
      }),
  })

  return null
}
