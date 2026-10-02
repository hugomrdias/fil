import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import * as Piece from '@filoz/synapse-core/piece'
import { CliError } from 'clipact'
import { ErrorCodes, notFound } from '../errors.ts'
import { extractCar } from './pack.ts'

/** Options for {@link downloadPiece}. */
export type DownloadPieceOptions = {
  url: string
  pieceCid: string
  /** Final file path; written only after the PieceCID matches. */
  output: string
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}

/**
 * Stream a piece to `output` while hashing it, and keep the file only when
 * the bytes match the expected PieceCID. Unlike synapse-core's
 * `downloadAndValidate`, this never buffers the whole piece in memory.
 */
export async function downloadPiece(
  options: DownloadPieceOptions
): Promise<{ size: number }> {
  const fetchFn = options.fetch ?? globalThis.fetch
  const response = await fetchFn(options.url, {
    ...(options.signal ? { signal: options.signal } : {}),
  }).catch((error: unknown) => {
    if (options.signal?.aborted) throw error
    throw new CliError({
      code: 'service_unavailable',
      message: `Could not reach ${options.url}.`,
      cause: error,
    })
  })
  if (response.status === 404) {
    await response.body?.cancel()
    throw notFound(`The provider does not have ${options.pieceCid}.`)
  }
  if (!(response.ok && response.body)) {
    await response.body?.cancel()
    throw new CliError({
      code: 'service_unavailable',
      message: `Retrieval from ${options.url} failed with HTTP ${response.status}.`,
    })
  }
  const output = resolve(options.output)
  await mkdir(dirname(output), { recursive: true })
  const tmp = `${output}.fil-partial`
  const hasher = Piece.hasher()
  let size = 0
  const hash = new Transform({
    transform(chunk: Uint8Array, _encoding, callback) {
      hasher.write(chunk)
      size += chunk.length
      callback(null, chunk)
    },
  })
  try {
    await pipeline(
      Readable.fromWeb(response.body as never),
      hash,
      createWriteStream(tmp)
    )
    const actual = hasher.finalize().toString()
    if (actual !== options.pieceCid) {
      throw new CliError({
        code: ErrorCodes.verificationFailed,
        message: `Downloaded bytes hash to ${actual}, expected ${options.pieceCid}.`,
      })
    }
    await rename(tmp, output)
    return { size }
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}

/** Options for {@link downloadArtifact}. */
export type DownloadArtifactOptions = {
  url: string
  pieceCid: string
  rootCid: string
  /** Directory to extract into; must be empty or absent. */
  output: string
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}

/**
 * Download an artifact's CAR through its exact piece, verify it against the
 * PieceCID and root CID, and extract the file tree into `output`.
 */
export async function downloadArtifact(
  options: DownloadArtifactOptions
): Promise<{ size: number; files: number }> {
  const output = resolve(options.output)
  const existing = await stat(output).catch(() => undefined)
  if (existing) throw outputExists(options.output)
  const carPath = join(dirname(output), `.${options.pieceCid}.car`)
  try {
    const { size } = await downloadPiece({ ...options, output: carPath })
    const tmp = `${output}.fil-partial`
    await rm(tmp, { recursive: true, force: true })
    const { rootCid, files } = await extractCar(carPath, tmp)
    if (rootCid.toString() !== options.rootCid) {
      await rm(tmp, { recursive: true, force: true })
      throw new CliError({
        code: ErrorCodes.verificationFailed,
        message: `CAR root is ${rootCid}, expected ${options.rootCid}.`,
      })
    }
    await rename(tmp, output)
    return { size, files }
  } finally {
    await rm(carPath, { force: true })
  }
}

/** Error returned when `get` would overwrite an existing path. */
export function outputExists(path: string): CliError {
  return new CliError({
    code: ErrorCodes.outputExists,
    message: `${path} already exists.`,
    next: [
      {
        by: 'agent',
        description:
          'Choose another path with --output, or pass --force for a file',
      },
    ],
  })
}
