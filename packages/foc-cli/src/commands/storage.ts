import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as Piece from '@filoz/synapse-core/piece'
import type { App } from '../app.ts'
import { PUT_SCOPES, RM_SCOPES } from '../auth/scopes.ts'
import { currentPayer, notLoggedIn, requireSession } from '../auth/session.ts'
import { ExitCode, FocError } from '../errors.ts'
import {
  getOperation,
  listOperations,
  type Operation,
} from '../state/operations.ts'
import {
  findResourcesByCid,
  getResource,
  listResources,
  type Resource,
} from '../state/resources.ts'
import { downloadArtifact, downloadPiece } from '../storage/get.ts'
import {
  type JobContext,
  runOperation,
  startPut,
  startRemove,
} from '../storage/jobs.ts'
import { createSynapseBackend } from '../storage/synapse.ts'
import { type RetrievalUrls, retrievalUrls } from '../storage/urls.ts'

/** Account scope for local state queries. */
function scope(app: App): { chainId: string; payer: string } {
  const payer = currentPayer(app)
  if (!payer) throw notLoggedIn()
  return { chainId: app.chain.id.toString(), payer }
}

/** Build a job context with a signing session holding `scopes`. */
async function jobContext(
  app: App,
  scopes: typeof PUT_SCOPES,
  progress?: (message: string) => void
): Promise<JobContext> {
  const sessionKey = await requireSession(app, scopes)
  return {
    db: app.db(),
    backend: createSynapseBackend(app, sessionKey),
    chainId: app.chain.id.toString(),
    payer: sessionKey.rootAddress,
    stagingDir: app.stagingDir,
    ...(progress ? { progress } : {}),
  }
}

/** Options for {@link put}. */
export type PutOptions = {
  path: string
  name?: string
  provider?: string
  progress?: (message: string) => void
}

/**
 * Store a file as a raw piece, or a directory as a UnixFS CAR, with one copy
 * on one provider, and return its resource and Curio URLs.
 */
export async function put(app: App, options: PutOptions) {
  const ctx = await jobContext(app, PUT_SCOPES, options.progress)
  return startPut(ctx, {
    path: options.path,
    ...(options.name ? { name: options.name } : {}),
    ...(options.provider
      ? { providerId: parseId(options.provider, 'provider') }
      : {}),
  })
}

/** Parse a decimal on-chain ID. */
function parseId(value: string, label: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new FocError('INVALID_INPUT', `Invalid ${label} ID: ${value}`, {
      exitCode: ExitCode.invalidInput,
    })
  }
  return BigInt(value)
}

/** Remove a managed resource's stored copy. */
export async function remove(
  app: App,
  ref: string,
  progress?: (message: string) => void
) {
  const ctx = await jobContext(app, RM_SCOPES, progress)
  return startRemove(ctx, ref)
}

/** Resume an unfinished operation with its saved input. */
export async function resume(
  app: App,
  id: string,
  progress?: (message: string) => void
) {
  const op = findOperation(app, id)
  if (op.executionStatus === 'completed') {
    throw new FocError(
      'ALREADY_COMPLETED',
      `Operation ${id} already completed.`,
      {
        exitCode: ExitCode.invalidInput,
        next: [
          { command: `ops inspect ${id}`, description: 'Show its outcome' },
        ],
      }
    )
  }
  const ctx = await jobContext(
    app,
    op.action === 'put' ? PUT_SCOPES : RM_SCOPES,
    progress
  )
  return runOperation(ctx, id)
}

/** Resolve a managed resource in the current account scope. */
function findResource(app: App, ref: string): Resource {
  const resource = getResource(app.db(), ref)
  const { chainId, payer } = scope(app)
  if (!resource || resource.chainId !== chainId || resource.payer !== payer) {
    throw new FocError('NOT_FOUND', `No managed resource ${ref}.`, {
      exitCode: ExitCode.notFound,
      next: [{ command: 'ls', description: 'List managed resources' }],
    })
  }
  return resource
}

/** Resolve an operation in the current account scope. */
function findOperation(app: App, id: string): Operation {
  const op = getOperation(app.db(), id)
  const { chainId, payer } = scope(app)
  if (!op || op.chainId !== chainId || op.payer !== payer) {
    throw new FocError('NOT_FOUND', `No operation ${id}.`, {
      exitCode: ExitCode.notFound,
      next: [{ command: 'ops ls', description: 'List operations' }],
    })
  }
  return op
}

/** Curio retrieval URLs for a resource's first copy. */
export function resourceUrls(resource: Resource): RetrievalUrls {
  const [copy] = resource.copies
  if (!copy) throw new Error(`Resource ${resource.ref} has no stored copies.`)
  return retrievalUrls({
    serviceURL: copy.serviceURL,
    pieceCid: resource.pieceCid,
    ...(resource.rootCid ? { rootCid: resource.rootCid } : {}),
  })
}

/** Options for {@link get}. */
export type GetOptions = {
  target: string
  output?: string
  force?: boolean
}

/**
 * Retrieve a managed resource by reference (or a PieceCID) from Curio and
 * verify it. Files are written as-is; artifacts are extracted to a directory.
 */
export async function get(app: App, options: GetOptions) {
  const { target } = options
  let resource: Resource | undefined
  if (target.startsWith('res_')) {
    resource = findResource(app, target)
  } else {
    const matches = findResourcesByCid(app.db(), scope(app), target)
    resource = matches[0]
  }

  if (!resource) {
    // Unmanaged PieceCID: locate a provider that serves it.
    const pieceCid = Piece.tryFrom(target)
    if (!pieceCid) {
      throw new FocError(
        'NOT_FOUND',
        `No managed resource or PieceCID ${target}.`,
        {
          exitCode: ExitCode.notFound,
        }
      )
    }
    const url = await Piece.resolvePieceUrl({
      client: app.client,
      address: scope(app).payer as `0x${string}`,
      pieceCid,
    }).catch((error: unknown) => {
      throw new FocError('NOT_FOUND', `No provider serves ${target}.`, {
        exitCode: ExitCode.notFound,
        cause: error,
      })
    })
    const output = resolve(options.output ?? target)
    await assertWritable(output, options.force)
    const { size } = await downloadPiece({ url, pieceCid: target, output })
    return { kind: 'file' as const, pieceCid: target, output, size, url }
  }

  const urls = resourceUrls(resource)
  const output = resolve(options.output ?? resource.name)
  if (resource.kind === 'artifact' && resource.rootCid) {
    const { size, files } = await downloadArtifact({
      url: urls.piece,
      pieceCid: resource.pieceCid,
      rootCid: resource.rootCid,
      output,
    })
    return {
      kind: resource.kind,
      ref: resource.ref,
      output,
      size,
      files,
      url: urls.piece,
    }
  }
  await assertWritable(output, options.force)
  const { size } = await downloadPiece({
    url: urls.piece,
    pieceCid: resource.pieceCid,
    output,
  })
  return {
    kind: resource.kind,
    ref: resource.ref,
    output,
    size,
    url: urls.piece,
  }
}

/** Refuse to overwrite an existing file unless forced. */
async function assertWritable(path: string, force = false): Promise<void> {
  if (force) return
  if (await stat(path).catch(() => undefined)) {
    throw new FocError(
      'OUTPUT_EXISTS',
      `${path} already exists; pass --force to overwrite.`,
      {
        exitCode: ExitCode.invalidInput,
      }
    )
  }
}

/** List managed resources, newest first. */
export function ls(app: App, options: { limit: number; all: boolean }) {
  const resources = listResources(app.db(), {
    ...scope(app),
    limit: options.limit,
    all: options.all,
  })
  return {
    network: app.network,
    resources: resources.map((resource) => ({
      ref: resource.ref,
      kind: resource.kind,
      name: resource.name,
      size: resource.size,
      status: resource.status,
      url: resource.url ?? '',
      createdAt: resource.createdAt,
    })),
  }
}

/**
 * Show a managed resource with its URLs. With `check`, probe the Curio URL
 * with a HEAD request.
 */
export async function inspect(
  app: App,
  ref: string,
  options: { check: boolean }
) {
  const resource = findResource(app, ref)
  const urls = resourceUrls(resource)
  if (!options.check) return { resource, urls }
  const probe = urls.ipfs ?? urls.piece
  const response = await fetch(probe, { method: 'HEAD' }).catch(() => undefined)
  return {
    resource,
    urls,
    retrieval: {
      url: probe,
      state: response?.ok ? ('ready' as const) : ('unavailable' as const),
      status: response?.status ?? 0,
      checkedAt: new Date().toISOString(),
    },
  }
}

/** List operations, most recently updated first. */
export function opsList(
  app: App,
  options: { limit: number; incomplete: boolean }
) {
  const operations = listOperations(app.db(), {
    ...scope(app),
    limit: options.limit,
    incomplete: options.incomplete,
  })
  return {
    network: app.network,
    operations: operations.map((op) => ({
      id: op.id,
      action: op.action,
      resourceRef: op.resourceRef,
      phase: op.phase,
      executionStatus: op.executionStatus,
      updatedAt: op.updatedAt,
      ...(op.error ? { error: op.error } : {}),
    })),
  }
}

/** Show a saved operation, including its checkpoints. */
export function opsInspect(app: App, id: string): Operation {
  return findOperation(app, id)
}
