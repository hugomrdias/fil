import type { MetadataObject } from '@filoz/synapse-core/utils'
import type { Address, Hex } from 'viem'
import type { SignedCommit } from '../state/operations.ts'

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

/** What storing `size` bytes at a placement costs the payer now. */
export type UploadQuote = {
  /** The payer can upload without depositing or approving anything. */
  ready: boolean
  /** USDFC base units to deposit first. */
  depositNeeded: bigint
  /** The payer must approve Warm Storage as an operator first. */
  needsApproval: boolean
  /** Storage rate added by this upload, in USDFC base units per month. */
  ratePerMonth: bigint
  /** Funds locked by this upload, in USDFC base units. */
  lockup: bigint
  /** Console link that prefills the deposit and approval. */
  fundingUrl: string
}

/**
 * Storage operations used by put and delete jobs. The synapse-core
 * implementation lives in `synapse.ts`; tests substitute a fake so
 * orchestration and resume logic run without a provider or chain.
 */
export interface StorageBackend {
  /** Choose one provider, preferring an existing data set with `metadata`. */
  selectPlacement(options: {
    metadata: MetadataObject
    providerId?: bigint
    signal?: AbortSignal
  }): Promise<Placement>
  /** Price an upload of `size` bytes and check the payer's readiness. */
  quote(options: { size: number; placement: Placement }): Promise<UploadQuote>
  /** Whether the provider already holds the piece. */
  hasPiece(options: {
    serviceURL: string
    pieceCid: string
    signal?: AbortSignal
  }): Promise<boolean>
  /** Upload bytes and wait until the provider has parked the piece. */
  upload(options: {
    serviceURL: string
    path: string
    size: number
    pieceCid: string
    signal?: AbortSignal
  }): Promise<void>
  /**
   * Sign a commit without sending it: create-and-add when the placement has
   * no data set, add otherwise. The nonce and client data set ID are chosen
   * here and saved with the signature.
   */
  signCommit(options: {
    placement: Placement
    pieceCid: string
    metadata: MetadataObject
    pieceMetadata: MetadataObject
  }): Promise<SignedCommit>
  /** Send a signed commit to the provider. */
  submitCommit(options: {
    placement: Placement
    pieceCid: string
    commit: SignedCommit
    pieceMetadata: MetadataObject
  }): Promise<Submission>
  /**
   * Find a commit on chain by its nonce. Returns the piece when FWSS has
   * recorded the nonce, or `undefined` when the commit has not landed.
   */
  findCommit(options: { nonce: bigint }): Promise<CommittedPiece | undefined>
  /**
   * Wait for a submission; `created` selects the create-and-add status
   * flow. Throws `commit_rejected` when the provider reports a failed
   * transaction.
   */
  waitForCommit(options: {
    statusUrl: string
    created: boolean
    signal?: AbortSignal
  }): Promise<CommittedPiece>
  /** Sign and submit a piece removal. */
  schedulePieceRemoval(options: {
    serviceURL: string
    dataSetId: bigint
    pieceId: bigint
  }): Promise<{ transactionHash: Hex }>
  /** Wait for a chain transaction and report whether it succeeded. */
  waitForTransaction(
    transactionHash: Hex,
    signal?: AbortSignal
  ): Promise<{ status: 'success' | 'reverted' }>
}
