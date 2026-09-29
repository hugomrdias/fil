import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import * as Piece from '@filoz/synapse-core/piece'
import { ExitCode, FocError } from '../errors.ts'
import { extractCar } from './pack.ts'

/** Options for {@link downloadPiece}. */
export type DownloadPieceOptions = {
  url: string
  pieceCid: string
  /** Final file path; written only after the PieceCID matches. */
  output: string
  fetch?: typeof globalThis.fetch
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
  const response = await fetchFn(options.url).catch((error: unknown) => {
    throw new FocError('RETRIEVAL_FAILED', `Could not reach ${options.url}.`, {
      exitCode: ExitCode.transient,
      retryable: true,
      cause: error,
    })
  })
  if (response.status === 404) {
    throw new FocError(
      'NOT_FOUND',
      `The provider does not have ${options.pieceCid}.`,
      {
        exitCode: ExitCode.notFound,
      }
    )
  }
  if (!(response.ok && response.body)) {
    throw new FocError(
      'RETRIEVAL_FAILED',
      `Retrieval from ${options.url} failed with HTTP ${response.status}.`,
      { exitCode: ExitCode.transient, retryable: true }
    )
  }
  const output = resolve(options.output)
  await mkdir(dirname(output), { recursive: true })
  const tmp = `${output}.foc-partial`
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
      throw new FocError(
        'INTEGRITY_ERROR',
        `Downloaded bytes hash to ${actual}, expected ${options.pieceCid}.`,
        { exitCode: ExitCode.transient, retryable: true }
      )
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
  if (existing) {
    throw new FocError('OUTPUT_EXISTS', `${options.output} already exists.`, {
      exitCode: ExitCode.invalidInput,
    })
  }
  const carPath = join(dirname(output), `.${options.pieceCid}.car`)
  try {
    const { size } = await downloadPiece({ ...options, output: carPath })
    const tmp = `${output}.foc-partial`
    await rm(tmp, { recursive: true, force: true })
    const { rootCid, files } = await extractCar(carPath, tmp)
    if (rootCid.toString() !== options.rootCid) {
      await rm(tmp, { recursive: true, force: true })
      throw new FocError(
        'INTEGRITY_ERROR',
        `CAR root is ${rootCid}, expected ${options.rootCid}.`,
        { exitCode: ExitCode.transient }
      )
    }
    await rename(tmp, output)
    return { size, files }
  } finally {
    await rm(carPath, { force: true })
  }
}
