import { tryFrom as tryPieceCid } from '@filoz/synapse-core/piece'
import { formatUnits, isAddress } from 'viem'
import { z } from 'zod'
import type { DataSet, PieceWithDataSet, SessionKey } from './api/client.ts'
import { formatEpochs } from './format.ts'
import { NETWORKS, type Network } from './networks.ts'
import { retrievalUrl } from './retrieval.ts'
import { ID_RE } from './search.ts'

/**
 * Input schemas and result shapes of fil-app's read-only WebMCP tools. The
 * tools read fil-api and the chain, and never sign or send anything.
 *
 * @see https://webmachinelearning.github.io/webmcp/
 */

/** Results per page when a tool call does not set `limit`. */
export const DEFAULT_LIMIT = 20

/** Most results a tool returns per page. */
export const MAX_LIMIT = 100

const network = z
  .enum(NETWORKS)
  .optional()
  .describe(
    "Network to read. Default: the network in the page URL, else the connected wallet's network, else mainnet."
  )

/**
 * Optional 0x address, lowercased.
 *
 * @param description - What the address is for.
 */
function address(description: string) {
  return z
    .string()
    .refine((value) => isAddress(value, { strict: false }), {
      error: 'must be a 0x-prefixed 20-byte hex address',
    })
    .transform((value) => value.toLowerCase())
    .optional()
    .describe(description)
}

const limit = z
  .number()
  .int()
  .min(1)
  .max(MAX_LIMIT)
  .optional()
  .describe(
    `Results per page, from 1 to ${MAX_LIMIT}. Default: ${DEFAULT_LIMIT}.`
  )

const cursor = z
  .string()
  .min(1)
  .optional()
  .describe('`nextCursor` from the previous page, to read the next one.')

const owner = address(
  'Wallet that owns the data. Default: the connected wallet. Ask the user to connect one when there is none.'
)

/** Input of `get_account_summary`. */
export const accountSummaryInput = z.strictObject({
  network,
  address: address(
    'Wallet whose Filecoin Pay account to read. Default: the connected wallet.'
  ),
})

/** Input of `list_data_sets`. */
export const listDataSetsInput = z.strictObject({
  network,
  owner,
  includeDeleted: z
    .boolean()
    .optional()
    .describe('Include deleted data sets. Default: false.'),
  limit,
  cursor,
})

const INVALID_DATA_SET_ID = 'must be a data set ID, such as "42"'

/** Input of `list_pieces`. */
export const listPiecesInput = z.strictObject({
  network,
  dataSetId: z
    .union(
      [
        z.string().regex(ID_RE, { error: INVALID_DATA_SET_ID }),
        z.number().int().nonnegative({ error: INVALID_DATA_SET_ID }),
      ],
      { error: INVALID_DATA_SET_ID }
    )
    .transform(String)
    .describe('Data set ID, from list_data_sets.'),
  includeRemoved: z
    .boolean()
    .optional()
    .describe('Include removed pieces. Default: false.'),
  limit,
  cursor,
})

/** Input of `lookup_piece`. */
export const lookupPieceInput = z.strictObject({
  network,
  cid: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const piece = tryPieceCid(value)
      if (!piece) {
        ctx.addIssue({
          code: 'custom',
          message: 'must be a PieceCID v2, starting with bafkzcib',
        })
        return z.NEVER
      }
      return piece.toString()
    })
    .describe('PieceCID v2 to find (bafkzcib…).'),
  limit,
  cursor,
})

/** Input of `list_session_keys`. */
export const listSessionKeysInput = z.strictObject({
  network,
  owner: address(
    'Wallet that authorized the keys. Default: the connected wallet.'
  ),
  includeExpired: z
    .boolean()
    .optional()
    .describe('Include expired and revoked keys. Default: false.'),
  limit,
  cursor,
})

/** Base URLs that tool results link to. */
export interface ResultLinks {
  /** fil-app origin, e.g. `https://fil-app.hugomrdias.dev`. */
  app: string
  /** fil-api base URL. */
  api: string
}

/**
 * Tool result for a fil-api data set.
 *
 * @param dataSet - fil-api data set.
 * @param network - Network it is on.
 * @param links - {@link ResultLinks}
 */
export function dataSetResult(
  dataSet: DataSet,
  network: Network,
  links: ResultLinks
) {
  return {
    dataSetId: dataSet.dataSetId,
    owner: dataSet.owner,
    providerId: dataSet.providerId,
    withCdn: dataSet.withCdn ?? false,
    deleted: dataSet.deleted ?? false,
    metadata: dataSet.metadata ?? {},
    createdAtBlock: dataSet.createdAtBlock,
    url: `${links.app}/${network}/data-sets/${dataSet.dataSetId}`,
  }
}

/**
 * Tool result for a fil-api piece, with links to view and retrieve it.
 *
 * @param piece - fil-api piece, optionally with its data set's owner and provider.
 * @param network - Network it is on.
 * @param links - {@link ResultLinks}
 */
export function pieceResult(
  piece: Omit<PieceWithDataSet, 'owner' | 'providerId'> &
    Partial<Pick<PieceWithDataSet, 'owner' | 'providerId'>>,
  network: Network,
  links: ResultLinks
) {
  return {
    dataSetId: piece.dataSetId,
    pieceId: piece.pieceId,
    cid: piece.cid,
    rawSize: piece.rawSize,
    removed: piece.removed ?? false,
    metadata: piece.metadata ?? {},
    ...(piece.owner === undefined ? {} : { owner: piece.owner }),
    ...(piece.providerId === undefined ? {} : { providerId: piece.providerId }),
    addedAtBlock: piece.addedAtBlock,
    url: piece.cid ? `${links.app}/${network}/pieces/${piece.cid}` : null,
    retrievalUrl: piece.cid
      ? retrievalUrl(links.api, network, piece.cid)
      : null,
  }
}

/**
 * ISO date for a Unix time in seconds, or `null` for 0.
 *
 * @param seconds - Unix time in seconds, as a decimal string.
 */
function isoFromSeconds(seconds: string) {
  return seconds === '0' ? null : new Date(Number(seconds) * 1000).toISOString()
}

/**
 * Tool result for a fil-api session key.
 *
 * @param key - fil-api session key.
 */
export function sessionKeyResult(key: SessionKey) {
  return {
    signer: key.signer,
    owner: key.identity,
    active: key.active,
    expiresAt: isoFromSeconds(key.expiry),
    permissions: key.permissions.map((permission) => ({
      name: permission.name ?? permission.permission,
      active: permission.active,
      expiresAt: isoFromSeconds(permission.expiry),
      origin: permission.origin,
    })),
  }
}

/** Filecoin Pay and Warm Storage state that `get_account_summary` reports. */
export interface AccountState {
  /** `pay.getAccountSummary` output. */
  summary: {
    funds: bigint
    availableFunds: bigint
    debt: bigint
    lockupRatePerEpoch: bigint
    lockupRatePerMonth: bigint
    runwayInEpochs: bigint
  }
  /** `warmStorage.getUploadCosts` output for a small new upload. */
  costs: {
    ready: boolean
    needsFwssMaxApproval: boolean
    depositNeeded: bigint
  }
}

/**
 * Tool result for a wallet's Filecoin Pay account. Amounts are exact USDFC
 * decimal strings. When the wallet cannot upload yet, it links to the setup
 * page prefilled with what is missing.
 *
 * @param state - {@link AccountState}
 * @param network - Network it is on.
 * @param address - Wallet address.
 * @param links - {@link ResultLinks}
 */
export function accountSummaryResult(
  state: AccountState,
  network: Network,
  address: string,
  links: ResultLinks
) {
  const { summary, costs } = state
  const usdfc = (value: bigint) => formatUnits(value, 18)
  const setup = new URL('/dashboard/setup', links.app)
  setup.searchParams.set('network', network)
  if (costs.depositNeeded > 0n) {
    setup.searchParams.set('deposit', usdfc(costs.depositNeeded))
  }
  return {
    network,
    address,
    token: 'USDFC',
    funds: usdfc(summary.funds),
    availableFunds: usdfc(summary.availableFunds),
    debt: usdfc(summary.debt),
    spendPerMonth: usdfc(summary.lockupRatePerMonth),
    runway:
      summary.lockupRatePerEpoch > 0n
        ? formatEpochs(summary.runwayInEpochs)
        : null,
    warmStorageApproved: !costs.needsFwssMaxApproval,
    readyToUpload: costs.ready,
    depositNeeded: usdfc(costs.depositNeeded),
    ...(costs.ready
      ? {}
      : {
          setupUrl: setup.toString(),
          nextStep:
            'Call prepare_setup_request, or open setupUrl, so the user can approve Warm Storage or deposit USDFC in their wallet.',
        }),
  }
}
