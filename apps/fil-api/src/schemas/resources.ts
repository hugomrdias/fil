import { z } from '@hono/zod-openapi'
import { AddressOut, Metadata, Uint } from './common.ts'

/**
 * Storage provider from the ServiceProviderRegistry, with Warm Storage
 * approval state.
 *
 * @see https://github.com/FilOzone/filecoin-services
 */
export const ProviderSchema = z
  .object({
    providerId: Uint,
    address: AddressOut,
    name: z.string().nullable(),
    serviceUrl: z.string().nullable(),
    active: z.boolean().nullable(),
    pdpProductActive: z.boolean().nullable(),
    approved: z.boolean().nullable(),
    endorsed: z.boolean().nullable(),
    createdAtBlock: Uint.nullable(),
    updatedAtBlock: Uint.nullable(),
  })
  .openapi('Provider')

/** Provider response item. */
export type Provider = z.infer<typeof ProviderSchema>

/** Warm Storage data set (a PDP proof set paid by its owner). */
export const DataSetSchema = z
  .object({
    dataSetId: Uint,
    providerId: Uint.nullable(),
    owner: AddressOut.nullable().openapi({
      description: 'Client address that pays for the data set',
    }),
    source: z.string().nullable(),
    metadata: Metadata,
    withCdn: z.boolean().nullable(),
    withIpfsIndexing: z.boolean().nullable(),
    pdpEndEpoch: Uint.nullable(),
    deleted: z.boolean().nullable(),
    createdAtBlock: Uint.nullable(),
    updatedAtBlock: Uint.nullable(),
  })
  .openapi('DataSet')

/** Data set response item. */
export type DataSet = z.infer<typeof DataSetSchema>

/** Piece stored in a data set. */
export const PieceSchema = z
  .object({
    dataSetId: Uint,
    pieceId: Uint,
    cid: z.string().nullable().openapi({ description: 'PieceCID (v2)' }),
    rawSize: Uint.nullable(),
    metadata: Metadata,
    removed: z.boolean().nullable(),
    addedAtBlock: Uint.nullable(),
    removedAtBlock: Uint.nullable(),
    updatedAtBlock: Uint.nullable(),
  })
  .openapi('Piece')

/** Piece response item. */
export type Piece = z.infer<typeof PieceSchema>

/** Piece with the owner and provider of its data set. */
export const PieceWithDataSetSchema = PieceSchema.extend({
  owner: AddressOut.nullable(),
  providerId: Uint.nullable(),
}).openapi('PieceWithDataSet')

/** Piece with data set context response item. */
export type PieceWithDataSet = z.infer<typeof PieceWithDataSetSchema>

/** Rail lifecycle state. */
export const RailStateSchema = z
  .enum(['active', 'terminated', 'finalized'])
  .openapi({ description: 'Rail lifecycle state' })

/**
 * Filecoin Pay payment rail, derived from rail events.
 *
 * @see https://github.com/FilOzone/filecoin-pay
 */
export const RailSchema = z
  .object({
    railId: Uint,
    state: RailStateSchema,
    payer: AddressOut,
    payee: AddressOut,
    token: AddressOut,
    operator: AddressOut,
    validator: AddressOut,
    serviceFeeRecipient: AddressOut,
    commissionRateBps: Uint,
    paymentRate: Uint.openapi({
      description: 'Current payment rate in token base units per epoch',
    }),
    lockupPeriod: Uint,
    lockupFixed: Uint,
    endEpoch: Uint.nullable(),
    terminatedBy: AddressOut.nullable(),
    settledUpTo: Uint.nullable(),
    totalSettledAmount: Uint,
    totalNetPayeeAmount: Uint,
    createdAtBlock: Uint,
    createdAt: z.number().int().openapi({ description: 'Unix timestamp' }),
    txHash: z.string(),
  })
  .openapi('Rail')

/** Rail response item. */
export type Rail = z.infer<typeof RailSchema>

/** One rail settlement event. */
export const SettlementSchema = z
  .object({
    railId: Uint,
    totalSettledAmount: Uint,
    totalNetPayeeAmount: Uint,
    operatorCommission: Uint,
    networkFee: Uint,
    settledUpTo: Uint,
    blockNumber: Uint,
    timestamp: z.number().int(),
    txHash: z.string(),
  })
  .openapi('Settlement')

/** Settlement response item. */
export type Settlement = z.infer<typeof SettlementSchema>

/** Current expiry of one session key permission. */
export const SessionKeyPermissionSchema = z
  .object({
    permission: z.string().openapi({
      description: 'EIP-712 typehash the signer may sign for',
    }),
    name: z.string().nullable().openapi({
      description: 'Known Warm Storage operation for the typehash',
      example: 'CreateDataSet',
    }),
    expiry: Uint.openapi({ description: 'Unix timestamp; 0 when revoked' }),
    active: z.boolean(),
    origin: z.string().nullable(),
    blockNumber: Uint,
    txHash: z.string(),
  })
  .openapi('SessionKeyPermission')

/**
 * Session key authorized by an identity in the SessionKeyRegistry.
 *
 * @see https://github.com/FilOzone/SessionKeyRegistry
 */
export const SessionKeySchema = z
  .object({
    identity: AddressOut,
    signer: AddressOut,
    active: z.boolean().openapi({
      description: 'Whether any permission is unexpired',
    }),
    expiry: Uint.openapi({ description: 'Latest permission expiry' }),
    updatedAtBlock: Uint,
    permissions: z.array(SessionKeyPermissionSchema),
  })
  .openapi('SessionKey')

/** Session key response item. */
export type SessionKey = z.infer<typeof SessionKeySchema>

/** Raw SessionKeyRegistry `AuthorizationsUpdated` event. */
export const SessionKeyEventSchema = z
  .object({
    identity: AddressOut,
    signer: AddressOut,
    expiry: Uint,
    permissions: z.array(z.string()),
    origin: z.string().nullable(),
    blockNumber: Uint,
    timestamp: z.number().int(),
    txHash: z.string(),
  })
  .openapi('SessionKeyEvent')

/** Session key event response item. */
export type SessionKeyEvent = z.infer<typeof SessionKeyEventSchema>

/** Indexer block position. */
export const CheckpointSchema = z
  .object({
    blockNumber: z.number().int(),
    timestamp: z.number().int(),
  })
  .openapi('Checkpoint')

/** Indexer progress for one schema. */
export const IndexerStatusSchema = z
  .object({
    schema: z.string(),
    chainName: z.string(),
    chainId: z.number().int(),
    latest: CheckpointSchema.nullable(),
    safe: CheckpointSchema.nullable(),
    finalized: CheckpointSchema.nullable(),
  })
  .openapi('IndexerStatus')

/** Network status. */
export const StatusSchema = z
  .object({
    network: z.string(),
    chainId: z.number().int(),
    indexers: z.array(IndexerStatusSchema),
  })
  .openapi('Status')

/** Status response body. */
export type Status = z.infer<typeof StatusSchema>
