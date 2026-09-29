import { createReadStream } from 'node:fs'
import { rm, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import * as Piece from '@filoz/synapse-core/piece'
import { SIZE_CONSTANTS } from '@filoz/synapse-core/utils'
import { ExitCode, FocError } from '../errors.ts'
import { transaction } from '../state/db.ts'
import { createId } from '../state/ids.ts'
import {
  acquireOperation,
  type Checkpoint,
  createOperation,
  type Operation,
  updateOperation,
} from '../state/operations.ts'
import { getResource, type Resource, saveResource } from '../state/resources.ts'
import { packDirectory } from './pack.ts'
import type { Placement, StorageBackend } from './types.ts'
import { type RetrievalUrls, retrievalUrls } from './urls.ts'

/** Data-set metadata namespacing CLI uploads of raw files. */
export const FILE_DATA_SET_METADATA = { source: 'foc' }

/**
 * Data-set metadata for artifacts. `withIPFSIndexing` asks Curio to index
 * the CAR so `/ipfs/<rootCid>` retrieval works.
 */
export const ARTIFACT_DATA_SET_METADATA = {
  source: 'foc',
  withIPFSIndexing: '',
}

/** Longest metadata value FWSS accepts. */
const MAX_METADATA_VALUE = 96

/** Everything a put or rm job needs besides its saved record. */
export type JobContext = {
  db: DatabaseSync
  backend: StorageBackend
  chainId: string
  payer: string
  /** Staging directory for an operation. */
  stagingDir: (operationId: string) => string
  /** Human progress, written to stderr by the caller when interactive. */
  progress?: (message: string) => void
}

/** Outcome of a put or rm, shaped for command output. */
export type JobResult = {
  operationId: string
  state: 'ready' | 'removal_pending'
  resource: Resource
  urls: RetrievalUrls
}

/** Options for {@link startPut}. */
export type StartPutOptions = {
  path: string
  name?: string
  providerId?: bigint
}

/**
 * Validate the input, save a new put operation before any external mutation,
 * then run it.
 */
export async function startPut(
  ctx: JobContext,
  options: StartPutOptions
): Promise<JobResult> {
  const sourcePath = resolve(options.path)
  const stats = await stat(sourcePath).catch(() => undefined)
  if (!stats || !(stats.isFile() || stats.isDirectory())) {
    throw new FocError(
      'INVALID_INPUT',
      `No file or directory at ${options.path}.`,
      {
        exitCode: ExitCode.invalidInput,
      }
    )
  }
  const kind = stats.isDirectory() ? 'artifact' : 'file'
  if (kind === 'file') assertPieceSize(stats.size)
  const op = createOperation(ctx.db, {
    action: 'put',
    resourceRef: createId('res'),
    chainId: ctx.chainId,
    payer: ctx.payer,
    input: {
      sourcePath,
      name: options.name ?? basename(sourcePath),
      kind,
      ...(options.providerId == null
        ? {}
        : { providerId: options.providerId.toString() }),
    },
  })
  return runOperation(ctx, op.id)
}

/**
 * Run or resume an operation. Takes the execution lock, continues from the
 * saved checkpoint, and records failures on the operation so it can be
 * resumed with `foc ops resume`.
 */
export async function runOperation(
  ctx: JobContext,
  operationId: string
): Promise<JobResult> {
  let op = acquireOperation(ctx.db, operationId)
  try {
    const result =
      op.action === 'put' ? await runPut(ctx, op) : await runRemove(ctx, op)
    op = updateOperation(ctx.db, op.id, {
      executionStatus: 'completed',
      phase: 'done',
      pid: null,
      error: null,
    })
    return result
  } catch (error) {
    updateOperation(ctx.db, op.id, {
      executionStatus: 'failed',
      pid: null,
      error: error instanceof Error ? error.message : String(error),
    })
    if (error instanceof FocError) throw error
    throw new FocError(
      'OPERATION_FAILED',
      `Operation ${op.id} failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        exitCode: ExitCode.transient,
        retryable: true,
        cause: error,
        next: [
          { command: `ops resume ${op.id}`, description: 'Continue this job' },
        ],
      }
    )
  }
}

/** Reject sizes outside the PDP piece limits. */
function assertPieceSize(size: number): void {
  if (
    size < SIZE_CONSTANTS.MIN_UPLOAD_SIZE ||
    size > SIZE_CONSTANTS.MAX_UPLOAD_SIZE
  ) {
    throw new FocError(
      'INVALID_SIZE',
      `Content must be between ${SIZE_CONSTANTS.MIN_UPLOAD_SIZE} and ${SIZE_CONSTANTS.MAX_UPLOAD_SIZE} bytes; got ${size}.`,
      { exitCode: ExitCode.invalidInput }
    )
  }
}

/** Compute the PieceCID of a file by streaming it. */
async function pieceCidOf(path: string): Promise<string> {
  return (await Piece.calculate(createReadStream(path))).toString()
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
 * never resubmits a commit it already sent.
 */
async function runPut(ctx: JobContext, op: Operation): Promise<JobResult> {
  const { input } = op
  const kind = input.kind ?? 'file'
  const name = input.name ?? 'upload'
  if (!input.sourcePath) throw new Error(`Operation ${op.id} has no source.`)

  // Prepare the bytes to store.
  let uploadPath = input.sourcePath
  if (kind === 'artifact') {
    uploadPath = join(ctx.stagingDir(op.id), 'artifact.car')
    const staged = await stat(uploadPath).catch(() => undefined)
    if (!staged) {
      if (op.checkpoint.pieceCid) {
        throw new FocError(
          'STAGING_MISSING',
          `Staged CAR for ${op.id} is missing; start a new put.`,
          { exitCode: ExitCode.invalidInput }
        )
      }
      op = save(ctx, op, {}, 'packing')
      ctx.progress?.(`Packing ${input.sourcePath}`)
      const packed = await packDirectory(input.sourcePath, uploadPath)
      op = save(ctx, op, {
        rootCid: packed.rootCid.toString(),
        size: packed.size,
      })
    }
  }

  const size = (await stat(uploadPath)).size
  assertPieceSize(size)
  ctx.progress?.('Computing PieceCID')
  const pieceCid = await pieceCidOf(uploadPath)
  if (op.checkpoint.pieceCid && op.checkpoint.pieceCid !== pieceCid) {
    throw new FocError(
      'SOURCE_CHANGED',
      `${uploadPath} changed since operation ${op.id} started.`,
      { exitCode: ExitCode.invalidInput }
    )
  }
  op = save(ctx, op, { pieceCid, size }, 'storing')

  // Choose a provider once; resumes reuse it.
  let placement = placementOf(op.checkpoint)
  if (!placement) {
    ctx.progress?.('Selecting a storage provider')
    placement = await ctx.backend.selectPlacement({
      metadata:
        kind === 'artifact'
          ? ARTIFACT_DATA_SET_METADATA
          : FILE_DATA_SET_METADATA,
      ...(input.providerId ? { providerId: BigInt(input.providerId) } : {}),
    })
    await ctx.backend.assertFunded({ size, placement })
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
  if (!op.checkpoint.statusUrl && !op.checkpoint.stored) {
    const present = await ctx.backend.hasPiece({
      serviceURL: placement.serviceURL,
      pieceCid,
    })
    if (!present) {
      ctx.progress?.(
        `Uploading ${size} bytes to provider ${placement.providerId}`
      )
      await ctx.backend.upload({
        serviceURL: placement.serviceURL,
        path: uploadPath,
        size,
        pieceCid,
      })
    }
    op = save(ctx, op, { stored: true })
  }

  // Commit on chain; the submission is saved before waiting.
  const created = placement.dataSetId == null
  if (!op.checkpoint.statusUrl) {
    op = save(ctx, op, {}, 'committing')
    ctx.progress?.(
      created ? 'Creating data set and adding piece' : 'Adding piece'
    )
    const pieceMetadata: Record<string, string> = {
      name: name.slice(0, MAX_METADATA_VALUE),
      ...(op.checkpoint.rootCid ? { ipfsRootCID: op.checkpoint.rootCid } : {}),
    }
    const submission = created
      ? await ctx.backend.createDataSetWithPiece({
          placement,
          pieceCid,
          metadata:
            kind === 'artifact'
              ? ARTIFACT_DATA_SET_METADATA
              : FILE_DATA_SET_METADATA,
          pieceMetadata,
        })
      : await ctx.backend.addPiece({ placement, pieceCid, pieceMetadata })
    op = save(ctx, op, {
      statusUrl: submission.statusUrl,
      transactionHash: submission.transactionHash,
    })
  }

  ctx.progress?.('Waiting for on-chain confirmation')
  const committed = await ctx.backend.waitForCommit({
    statusUrl: op.checkpoint.statusUrl as string,
    created,
  })

  const urls = retrievalUrls({
    serviceURL: placement.serviceURL,
    pieceCid,
    ...(op.checkpoint.rootCid ? { rootCid: op.checkpoint.rootCid } : {}),
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
  transaction(ctx.db, () => {
    saveResource(ctx.db, resource)
    updateOperation(ctx.db, op.id, {
      checkpoint: {
        dataSetId: committed.dataSetId.toString(),
        pieceId: committed.pieceId.toString(),
        confirmed: true,
      },
    })
  })
  if (kind === 'artifact') {
    await rm(ctx.stagingDir(op.id), { recursive: true, force: true })
  }
  return { operationId: op.id, state: 'ready', resource, urls }
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
 * Save a new rm operation for a managed resource, then run it.
 */
export async function startRemove(
  ctx: JobContext,
  ref: string
): Promise<JobResult> {
  const resource = getResource(ctx.db, ref)
  if (
    !resource ||
    resource.chainId !== ctx.chainId ||
    resource.payer !== ctx.payer
  ) {
    throw new FocError(
      'NOT_FOUND',
      `No managed resource ${ref} for this account.`,
      {
        exitCode: ExitCode.notFound,
        next: [{ command: 'ls', description: 'List managed resources' }],
      }
    )
  }
  const [copy] = resource.copies
  if (!copy) throw new Error(`Resource ${ref} has no stored copies.`)
  const op = createOperation(ctx.db, {
    action: 'rm',
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
 * is `removal_pending`.
 */
async function runRemove(ctx: JobContext, op: Operation): Promise<JobResult> {
  const resource = getResource(ctx.db, op.resourceRef)
  if (!resource) throw new Error(`Resource ${op.resourceRef} no longer exists.`)
  const { serviceURL, dataSetId, pieceId } = op.checkpoint
  if (!(serviceURL && dataSetId && pieceId)) {
    throw new Error(`Operation ${op.id} is missing its removal target.`)
  }
  if (!op.checkpoint.transactionHash) {
    op = save(ctx, op, {}, 'removing')
    ctx.progress?.(`Scheduling removal of piece ${pieceId}`)
    const { transactionHash } = await ctx.backend.schedulePieceRemoval({
      serviceURL,
      dataSetId: BigInt(dataSetId),
      pieceId: BigInt(pieceId),
    })
    op = save(ctx, op, { transactionHash })
  }
  ctx.progress?.('Waiting for the removal transaction')
  await ctx.backend.waitForTransaction(
    op.checkpoint.transactionHash as `0x${string}`
  )
  const updated: Resource = { ...resource, status: 'removal_pending' }
  transaction(ctx.db, () => {
    saveResource(ctx.db, updated)
    updateOperation(ctx.db, op.id, { checkpoint: { confirmed: true } })
  })
  return {
    operationId: op.id,
    state: 'removal_pending',
    resource: updated,
    urls: retrievalUrls({ serviceURL, pieceCid: resource.pieceCid }),
  }
}
