import { createReadStream } from 'node:fs'
import { rm, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import * as Piece from '@filoz/synapse-core/piece'
import { SIZE_CONSTANTS } from '@filoz/synapse-core/utils'
import { CliError, isCliError } from 'clipact'
import {
  ErrorCodes,
  invalidInput,
  notFound,
  operationError,
} from '../errors.ts'
import { transaction } from '../state/db.ts'
import { createId } from '../state/ids.ts'
import {
  acquireOperation,
  type Checkpoint,
  createOperation,
  getOperation,
  type Operation,
  releaseOperation,
  updateOperation,
} from '../state/operations.ts'
import { getResource, type Resource, saveResource } from '../state/resources.ts'
import { packDirectory } from './pack.ts'
import type {
  CommittedPiece,
  Placement,
  StorageBackend,
  UploadQuote,
} from './types.ts'
import { type RetrievalUrls, resourceUrls, retrievalUrls } from './urls.ts'

/** Data-set metadata namespacing CLI uploads of raw files. */
export const FILE_DATA_SET_METADATA = { source: 'fil' }

/**
 * Data-set metadata for artifacts. `withIPFSIndexing` asks Curio to index
 * the CAR so `/ipfs/<rootCid>` retrieval works.
 */
export const ARTIFACT_DATA_SET_METADATA = {
  source: 'fil',
  withIPFSIndexing: '',
}

/** Longest metadata value FWSS accepts. */
const MAX_METADATA_VALUE = 96

/** A step of a job, reported as progress. */
export type JobPhase =
  | 'packing'
  | 'hashing'
  | 'placing'
  | 'uploading'
  | 'committing'
  | 'removing'

/** Everything a put or delete job needs besides its saved record. */
export type JobContext = {
  db: DatabaseSync
  backend: StorageBackend
  chainId: string
  payer: string
  /** Staging directory for an operation. */
  stagingDir: (operationId: string) => string
  /** Aborted on SIGINT, SIGTERM, or SIGHUP; stops at the next step. */
  signal?: AbortSignal
  /** Progress for the caller to report on stderr. */
  progress?: (event: { phase: JobPhase; message: string }) => void
  /** Called once the job's operation is saved and locked. */
  onOperation?: (operation: Operation) => void
}

/** Outcome of a put or delete, shaped for command output. */
export type JobResult = {
  operationId: string
  state: 'ready' | 'removal_pending'
  resource: Resource
  urls: RetrievalUrls
}

/** Options for {@link startPut}. */
export type StartPutOptions = {
  path: string
  name?: string | undefined
  providerId?: bigint | undefined
}

/** A file or directory checked for a put. */
type PutSource = {
  sourcePath: string
  kind: 'file' | 'artifact'
  name: string
  /** Bytes of a file; directories are sized after packing. */
  size?: number
}

/** Check that `path` is a storable file or directory. */
async function inspectSource(options: StartPutOptions): Promise<PutSource> {
  const sourcePath = resolve(options.path)
  const stats = await stat(sourcePath).catch(() => undefined)
  if (!stats || !(stats.isFile() || stats.isDirectory())) {
    throw invalidInput(`No file or directory at ${options.path}.`, 'path')
  }
  const name = options.name ?? basename(sourcePath)
  if (stats.isDirectory()) return { sourcePath, kind: 'artifact', name }
  assertPieceSize(stats.size)
  return { sourcePath, kind: 'file', name, size: stats.size }
}

/**
 * Validate the input, save a new put operation before any external mutation,
 * then run it.
 */
export async function startPut(
  ctx: JobContext,
  options: StartPutOptions
): Promise<JobResult> {
  const source = await inspectSource(options)
  const op = createOperation(ctx.db, {
    action: 'put',
    resourceRef: createId('res'),
    chainId: ctx.chainId,
    payer: ctx.payer,
    input: {
      sourcePath: source.sourcePath,
      name: source.name,
      kind: source.kind,
      providerId: options.providerId?.toString(),
    },
  })
  return await runOperation(ctx, op.id)
}

/** What a put would do, from {@link estimatePut}. */
export type PutEstimate = {
  kind: 'file' | 'artifact'
  name: string
  /** Bytes to store: the file, or the packed CAR. */
  size: number
  /** Files in a directory; 1 for a file. */
  files: number
  /** IPFS root CID of a directory. */
  rootCid?: string
  /** Chosen provider and quote, when a session key is available. */
  placement?: Placement
  quote?: UploadQuote
}

/** Options for {@link estimatePut}. */
export type EstimatePutOptions = StartPutOptions & {
  /** Prices the upload; omitted when not logged in. */
  backend?: StorageBackend | undefined
}

/**
 * Describe a put without side effects on providers or the chain: content
 * inventory, stored size, and, with a backend, the provider it would use and
 * what it would cost. Directories are packed only to measure the CAR;
 * nothing is written to disk.
 */
export async function estimatePut(
  options: EstimatePutOptions
): Promise<PutEstimate> {
  const source = await inspectSource(options)
  let estimate: PutEstimate
  if (source.kind === 'file') {
    estimate = {
      kind: 'file',
      name: source.name,
      size: source.size ?? 0,
      files: 1,
    }
  } else {
    const packed = await packDirectory(source.sourcePath)
    assertPieceSize(packed.size)
    estimate = {
      kind: 'artifact',
      name: source.name,
      size: packed.size,
      files: packed.files,
      rootCid: packed.rootCid.toString(),
    }
  }
  if (!options.backend) return estimate
  const placement = await options.backend.selectPlacement({
    metadata: metadataFor(estimate.kind),
    providerId: options.providerId,
  })
  const quote = await options.backend.quote({ size: estimate.size, placement })
  return { ...estimate, placement, quote }
}

/**
 * Run or resume an operation. A completed operation returns its saved
 * outcome. Otherwise this takes the execution lock, continues from the saved
 * checkpoint, and records failures so the job can be resumed with
 * `fil operations resume`.
 */
export async function runOperation(
  ctx: JobContext,
  operationId: string
): Promise<JobResult> {
  const saved = getOperation(ctx.db, operationId)
  if (!saved) throw notFound(`Operation ${operationId} not found.`)
  if (saved.executionStatus === 'completed') return savedOutcome(ctx.db, saved)
  const op = acquireOperation(ctx.db, operationId)
  try {
    ctx.onOperation?.(op)
    return op.action === 'put'
      ? await runPut(ctx, op)
      : await runRemove(ctx, op)
  } catch (error) {
    updateOperation(ctx.db, op.id, {
      executionStatus: 'failed',
      pid: null,
      error: ctx.signal?.aborted
        ? 'Interrupted'
        : error instanceof Error
          ? error.message
          : String(error),
    })
    // clipact reports an interruption itself, with the checkpoint's steps.
    if (ctx.signal?.aborted) throw error
    throw operationError(error, op.id)
  } finally {
    releaseOperation(op.id)
  }
}

/** The saved outcome of a completed operation; nothing is re-run. */
export function savedOutcome(db: DatabaseSync, op: Operation): JobResult {
  const resource = getResource(db, op.resourceRef)
  if (!resource) {
    throw notFound(`Resource ${op.resourceRef} of ${op.id} no longer exists.`)
  }
  return jobResult(op, resource)
}

/** Shape a finished operation and its resource for command output. */
function jobResult(op: Operation, resource: Resource): JobResult {
  return {
    operationId: op.id,
    state: op.action === 'put' ? 'ready' : 'removal_pending',
    resource,
    urls: resourceUrls(resource),
  }
}

/**
 * Save the resource and mark the operation completed in one transaction, so
 * a stop at this point leaves a finished job, never a half-finished one.
 */
function complete(
  ctx: JobContext,
  op: Operation,
  resource: Resource,
  checkpoint: Checkpoint = {}
): void {
  transaction(ctx.db, () => {
    saveResource(ctx.db, resource)
    updateOperation(ctx.db, op.id, {
      executionStatus: 'completed',
      phase: 'done',
      pid: null,
      error: null,
      checkpoint,
    })
  })
}

/** Reject sizes outside the PDP piece limits. */
function assertPieceSize(size: number): void {
  if (
    size < SIZE_CONSTANTS.MIN_UPLOAD_SIZE ||
    size > SIZE_CONSTANTS.MAX_UPLOAD_SIZE
  ) {
    throw invalidInput(
      `Content must be between ${SIZE_CONSTANTS.MIN_UPLOAD_SIZE} and ${SIZE_CONSTANTS.MAX_UPLOAD_SIZE} bytes; got ${size}.`,
      'path'
    )
  }
}

/** Data-set metadata for a resource kind. */
function metadataFor(kind: 'file' | 'artifact') {
  return kind === 'artifact'
    ? ARTIFACT_DATA_SET_METADATA
    : FILE_DATA_SET_METADATA
}

/**
 * Compute the PieceCID of a file by streaming it. Aborting `signal` destroys
 * the read stream, which stops the hashing.
 */
async function pieceCidOf(path: string, signal?: AbortSignal): Promise<string> {
  const stream = createReadStream(path, { signal })
  return (await Piece.calculate(stream)).toString()
}

/** Save checkpoint fields and return the updated operation. */
function save(
  ctx: JobContext,
  op: Operation,
  checkpoint: Checkpoint,
  phase?: Operation['phase']
): Operation {
  return updateOperation(ctx.db, op.id, {
    checkpoint,
    ...(phase ? { phase } : {}),
  })
}

/**
 * Put steps: pack (artifacts), identify, place, upload, commit, record. Each
 * step saves its result first, so a resumed job skips completed work and
 * never sends a second commit for the same content.
 */
async function runPut(ctx: JobContext, op: Operation): Promise<JobResult> {
  const { input } = op
  const kind = input.kind ?? 'file'
  const name = input.name ?? 'upload'
  const signal = ctx.signal
  if (!input.sourcePath) throw new Error(`Operation ${op.id} has no source.`)

  // Prepare the bytes to store.
  let uploadPath = input.sourcePath
  if (kind === 'artifact') {
    uploadPath = join(ctx.stagingDir(op.id), 'artifact.car')
    const staged = await stat(uploadPath).catch(() => undefined)
    if (!staged) {
      if (op.checkpoint.pieceCid) {
        throw new CliError({
          code: ErrorCodes.stagingMissing,
          message: `The staged CAR of ${op.id} is missing, so it cannot be resumed.`,
          next: [
            {
              by: 'agent',
              command: `fil put ${input.sourcePath}`,
              description: 'Start a new put of the same directory',
            },
          ],
        })
      }
      op = save(ctx, op, {}, 'packing')
      ctx.progress?.({
        phase: 'packing',
        message: `Packing ${input.sourcePath}`,
      })
      const packed = await packDirectory(input.sourcePath, uploadPath)
      op = save(ctx, op, {
        rootCid: packed.rootCid.toString(),
        size: packed.size,
      })
    }
  }

  signal?.throwIfAborted()
  const size = (await stat(uploadPath)).size
  assertPieceSize(size)
  ctx.progress?.({ phase: 'hashing', message: 'Computing PieceCID' })
  const pieceCid = await pieceCidOf(uploadPath, signal)
  if (op.checkpoint.pieceCid && op.checkpoint.pieceCid !== pieceCid) {
    throw new CliError({
      code: ErrorCodes.sourceChanged,
      message: `${uploadPath} changed since operation ${op.id} started.`,
      next: [
        {
          by: 'agent',
          command: `fil put ${input.sourcePath}`,
          description: 'Start a new put with the current content',
        },
      ],
    })
  }
  op = save(ctx, op, { pieceCid, size }, 'storing')

  // Choose a provider once; resumes reuse it.
  let placement = placementOf(op.checkpoint)
  if (!placement) {
    ctx.progress?.({
      phase: 'placing',
      message: 'Selecting a storage provider',
    })
    placement = await ctx.backend.selectPlacement({
      metadata: metadataFor(kind),
      providerId: input.providerId ? BigInt(input.providerId) : undefined,
    })
    const quote = await ctx.backend.quote({ size, placement })
    if (!quote.ready) throw insufficientFunds(quote)
    op = save(ctx, op, {
      providerId: placement.providerId.toString(),
      serviceURL: placement.serviceURL,
      payee: placement.payee,
      ...(placement.dataSetId == null
        ? {}
        : {
            dataSetId: placement.dataSetId.toString(),
            clientDataSetId: placement.clientDataSetId?.toString(),
          }),
    })
  }

  // Upload unless the provider already has the piece.
  if (!(op.checkpoint.commit || op.checkpoint.stored)) {
    const present = await ctx.backend.hasPiece({
      serviceURL: placement.serviceURL,
      pieceCid,
    })
    if (!present) {
      ctx.progress?.({
        phase: 'uploading',
        message: `Uploading ${size} bytes to provider ${placement.providerId}`,
      })
      await ctx.backend.upload({
        serviceURL: placement.serviceURL,
        path: uploadPath,
        size,
        pieceCid,
      })
    }
    op = save(ctx, op, { stored: true })
  }

  const committed = await commit(ctx, op, placement, { pieceCid, name })

  const urls = retrievalUrls({
    serviceURL: placement.serviceURL,
    pieceCid,
    rootCid: op.checkpoint.rootCid,
  })
  const resource: Resource = {
    ref: op.resourceRef,
    kind,
    name,
    chainId: op.chainId,
    payer: op.payer,
    pieceCid,
    ...(op.checkpoint.rootCid ? { rootCid: op.checkpoint.rootCid } : {}),
    size,
    copies: [
      {
        providerId: placement.providerId.toString(),
        dataSetId: committed.dataSetId.toString(),
        pieceId: committed.pieceId.toString(),
        serviceURL: placement.serviceURL,
      },
    ],
    url: urls.ipfs ?? urls.piece,
    status: 'active',
    createdAt: new Date().toISOString(),
  }
  complete(ctx, op, resource, {
    dataSetId: committed.dataSetId.toString(),
    pieceId: committed.pieceId.toString(),
  })
  if (kind === 'artifact') {
    await rm(ctx.stagingDir(op.id), { recursive: true, force: true }).catch(
      () => undefined
    )
  }
  return { operationId: op.id, state: 'ready', resource, urls }
}

/**
 * Commit the stored piece on chain exactly once. The commit is signed with a
 * fresh nonce and saved before it is sent. A resume first asks FWSS whether
 * that nonce was used; if so, the commit landed and nothing is sent. If not,
 * the same signature is sent again, and FWSS rejects any second use of its
 * nonce, so at most one commit takes effect.
 *
 * @see https://github.com/hugomrdias/fil/issues/1
 */
async function commit(
  ctx: JobContext,
  op: Operation,
  placement: Placement,
  piece: { pieceCid: string; name: string }
): Promise<CommittedPiece> {
  const pieceMetadata: Record<string, string> = {
    name: piece.name.slice(0, MAX_METADATA_VALUE),
    ...(op.checkpoint.rootCid ? { ipfsRootCID: op.checkpoint.rootCid } : {}),
  }
  const saved = op.checkpoint.commit
  if (saved) {
    const landed = await ctx.backend.findCommit({ nonce: BigInt(saved.nonce) })
    if (landed) return landed
  }

  op = save(ctx, op, {}, 'committing')
  let signed = saved
  if (!signed) {
    ctx.progress?.({ phase: 'committing', message: 'Signing the commit' })
    signed = await ctx.backend.signCommit({
      placement,
      pieceCid: piece.pieceCid,
      metadata: metadataFor(op.input.kind ?? 'file'),
      pieceMetadata,
    })
    op = save(ctx, op, { commit: signed })
  }

  if (!op.checkpoint.statusUrl) {
    ctx.progress?.({
      phase: 'committing',
      message: signed.created
        ? 'Creating data set and adding piece'
        : 'Adding piece',
    })
    const submission = await ctx.backend.submitCommit({
      placement,
      pieceCid: piece.pieceCid,
      commit: signed,
      pieceMetadata,
    })
    op = save(ctx, op, {
      statusUrl: submission.statusUrl,
      transactionHash: submission.transactionHash,
    })
  }

  ctx.progress?.({
    phase: 'committing',
    message: 'Waiting for on-chain confirmation',
  })
  try {
    return await ctx.backend.waitForCommit({
      statusUrl: op.checkpoint.statusUrl as string,
      created: signed.created,
    })
  } catch (error) {
    if (isCliError(error) && error.code === ErrorCodes.commitRejected) {
      // A failed transaction leaves the nonce unused; forget its status so a
      // resume sends the same signature again.
      save(ctx, op, { statusUrl: undefined, transactionHash: undefined })
    }
    throw error
  }
}

/** Error returned when the payer cannot cover an upload. */
function insufficientFunds(quote: UploadQuote): CliError {
  return new CliError({
    code: ErrorCodes.insufficientFunds,
    message: quote.needsApproval
      ? 'The payer must deposit USDFC and approve Warm Storage before uploading.'
      : 'The payer must deposit more USDFC before uploading.',
    details: {
      fundingUrl: quote.fundingUrl,
      depositNeeded: quote.depositNeeded.toString(),
      needsApproval: quote.needsApproval,
    },
    next: [
      {
        by: 'user',
        description: `Fund the account at ${quote.fundingUrl}`,
      },
    ],
  })
}

/** Rebuild a saved placement from a checkpoint. */
function placementOf(checkpoint: Checkpoint): Placement | undefined {
  if (!(checkpoint.providerId && checkpoint.serviceURL && checkpoint.payee)) {
    return undefined
  }
  return {
    providerId: BigInt(checkpoint.providerId),
    serviceURL: checkpoint.serviceURL,
    payee: checkpoint.payee as `0x${string}`,
    ...(checkpoint.dataSetId && checkpoint.clientDataSetId
      ? {
          dataSetId: BigInt(checkpoint.dataSetId),
          clientDataSetId: BigInt(checkpoint.clientDataSetId),
        }
      : {}),
  }
}

/**
 * Save a new delete operation for a managed resource, then run it.
 */
export async function startRemove(
  ctx: JobContext,
  ref: string
): Promise<JobResult> {
  const resource = getResource(ctx.db, ref, ctx)
  if (!resource) {
    throw notFound(`No managed resource ${ref} for this account.`, {
      by: 'agent',
      command: 'fil ls',
      description: 'List managed resources',
    })
  }
  if (resource.status !== 'active') {
    throw invalidInput(`${ref} is already pending removal.`, 'ref')
  }
  const [copy] = resource.copies
  if (!copy) throw new Error(`Resource ${ref} has no stored copies.`)
  const op = createOperation(ctx.db, {
    action: 'delete',
    resourceRef: ref,
    chainId: ctx.chainId,
    payer: ctx.payer,
    input: {},
    checkpoint: {
      providerId: copy.providerId,
      serviceURL: copy.serviceURL,
      dataSetId: copy.dataSetId,
      pieceId: copy.pieceId,
    },
  })
  return await runOperation(ctx, op.id)
}

/**
 * Schedule removal of the resource's piece and wait for the transaction.
 * The provider deletes the data at its next proving boundary, so the result
 * is `removal_pending`. A reverted transaction leaves the resource active.
 */
async function runRemove(ctx: JobContext, op: Operation): Promise<JobResult> {
  const resource = getResource(ctx.db, op.resourceRef)
  if (!resource) throw notFound(`Resource ${op.resourceRef} no longer exists.`)
  const { serviceURL, dataSetId, pieceId } = op.checkpoint
  if (!(serviceURL && dataSetId && pieceId)) {
    throw new Error(`Operation ${op.id} is missing its removal target.`)
  }
  if (!op.checkpoint.transactionHash) {
    op = save(ctx, op, {}, 'removing')
    ctx.progress?.({
      phase: 'removing',
      message: `Scheduling removal of piece ${pieceId}`,
    })
    const { transactionHash } = await ctx.backend.schedulePieceRemoval({
      serviceURL,
      dataSetId: BigInt(dataSetId),
      pieceId: BigInt(pieceId),
    })
    op = save(ctx, op, { transactionHash })
  }
  const hash = op.checkpoint.transactionHash as `0x${string}`
  ctx.progress?.({
    phase: 'removing',
    message: 'Waiting for the removal transaction',
  })
  const receipt = await ctx.backend.waitForTransaction(hash)
  if (receipt.status !== 'success') {
    // The reverted transaction had no effect; a resume signs a new one.
    save(ctx, op, { transactionHash: undefined })
    throw new CliError({
      code: ErrorCodes.removalReverted,
      message: `Removal transaction ${hash} reverted; the piece is still stored.`,
    })
  }
  const updated: Resource = { ...resource, status: 'removal_pending' }
  complete(ctx, op, updated)
  return jobResult(op, updated)
}
