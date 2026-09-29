import type { MetadataObject } from '@filoz/synapse-core/utils'
import type { Address, Hex } from 'viem'

/** Provider and data set chosen for a single-copy upload. */
export type Placement = {
  providerId: bigint
  serviceURL: string
  payee: Address
  /** Existing data set to add to; `undefined` when a new one is created. */
  dataSetId?: bigint
  clientDataSetId?: bigint
}

/** A provider submission awaiting confirmation. */
export type Submission = { transactionHash: Hex; statusUrl: string }

/** A confirmed piece in a data set. */
export type CommittedPiece = { dataSetId: bigint; pieceId: bigint }

/**
 * Storage operations used by `put` and `rm`. The synapse-core implementation
 * lives in `synapse.ts`; tests substitute a fake so orchestration and resume
 * logic run without a provider or chain.
 */
export interface StorageBackend {
  /** Choose one provider, preferring an existing data set with `metadata`. */
  selectPlacement(options: {
    metadata: MetadataObject
    providerId?: bigint
  }): Promise<Placement>
  /** Throw `FUNDING_REQUIRED` when the payer cannot afford the upload. */
  assertFunded(options: { size: number; placement: Placement }): Promise<void>
  /** Whether the provider already holds the piece. */
  hasPiece(options: { serviceURL: string; pieceCid: string }): Promise<boolean>
  /** Upload bytes and wait until the provider has parked the piece. */
  upload(options: {
    serviceURL: string
    path: string
    size: number
    pieceCid: string
    onProgress?: (bytes: number) => void
  }): Promise<void>
  /** Sign and submit the piece to an existing data set. */
  addPiece(options: {
    placement: Placement
    pieceCid: string
    pieceMetadata: MetadataObject
  }): Promise<Submission>
  /** Sign and submit a new data set containing the piece. */
  createDataSetWithPiece(options: {
    placement: Placement
    pieceCid: string
    metadata: MetadataObject
    pieceMetadata: MetadataObject
  }): Promise<Submission>
  /** Wait for a submission; `created` selects the create-and-add status flow. */
  waitForCommit(options: {
    statusUrl: string
    created: boolean
  }): Promise<CommittedPiece>
  /** Sign and submit a piece removal. */
  schedulePieceRemoval(options: {
    serviceURL: string
    dataSetId: bigint
    pieceId: bigint
  }): Promise<{ transactionHash: Hex }>
  /** Wait for a chain transaction to be included. */
  waitForTransaction(transactionHash: Hex): Promise<void>
}
