import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdir, open, readdir, rename, rm } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { CarIndexedReader, CarWriter } from '@ipld/car'
import { CliError } from 'clipact'
import { exporter } from 'ipfs-unixfs-exporter'
import {
  type DirectoryCandidate,
  type FileCandidate,
  type ImporterOptions,
  importer,
} from 'ipfs-unixfs-importer'
import { CID } from 'multiformats/cid'
import * as Digest from 'multiformats/hashes/digest'
import { sha256 } from 'multiformats/hashes/sha2'
import { ErrorCodes, invalidInput } from '../errors.ts'

/**
 * The single UnixFS profile used for every artifact: IPIP-499
 * `unixfs-v1-2025` (CIDv1, raw leaves, 1 MiB chunks), matching Filecoin Pin.
 *
 * @see https://github.com/ipfs/specs/pull/499
 */
export const IMPORTER_OPTIONS: ImporterOptions = { profile: 'unixfs-v1-2025' }

/** A file included in an artifact, relative to the packed directory. */
export type PackEntry = { path: string; size: number }

/**
 * List the files and directories to pack, sorted for a deterministic DAG.
 * Dotfiles and dot-directories are skipped. Symlinks are rejected rather than
 * followed, so a publication never reaches outside the chosen directory.
 */
export async function listEntries(
  root: string
): Promise<{ files: PackEntry[]; directories: string[] }> {
  const files: PackEntry[] = []
  const directories: string[] = []
  async function walk(dir: string): Promise<void> {
    const names = (await readdir(dir)).sort()
    for (const name of names) {
      if (name.startsWith('.')) continue
      const path = join(dir, name)
      const stats = await lstat(path)
      const rel = relative(root, path).split(sep).join('/')
      if (stats.isSymbolicLink()) {
        throw invalidInput(`Symlinks are not supported: ${rel}`, 'path')
      }
      if (stats.isDirectory()) {
        directories.push(rel)
        await walk(path)
      } else if (stats.isFile()) {
        files.push({ path: rel, size: stats.size })
      }
    }
  }
  await walk(root)
  return { files, directories }
}

/** Result of {@link packDirectory}. */
export type PackResult = {
  rootCid: CID
  /** CAR size in bytes. */
  size: number
  files: number
}

/**
 * A CID with the same encoded length as a UnixFS root, written into the CAR
 * header until the real root is known.
 */
function placeholderCid(): CID {
  return CID.create(1, 0x70, Digest.create(sha256.code, new Uint8Array(32)))
}

/**
 * Pack a directory into a UnixFS CAR at `carPath`. Blocks stream to a
 * temporary file under a placeholder root; the header is patched with the
 * real root, then the file is renamed into place.
 *
 * @see https://github.com/filecoin-project/filecoin-pin/blob/master/documentation/behind-the-scenes-of-adding-a-file.md
 */
export async function packDirectory(
  dir: string,
  carPath: string
): Promise<PackResult> {
  const root = resolve(dir)
  const name = basename(root)
  const { files, directories } = await listEntries(root)
  await mkdir(dirname(carPath), { recursive: true })
  const tmpPath = `${carPath}.tmp`

  const { writer, out } = CarWriter.create([placeholderCid()])
  const written = pipeline(Readable.from(out), createWriteStream(tmpPath))
  const seen = new Set<string>()
  const blockstore = {
    async put(cid: CID, bytes: Uint8Array) {
      const key = cid.toString()
      if (!seen.has(key)) {
        seen.add(key)
        await writer.put({ cid, bytes })
      }
      return cid
    },
  }

  // Parent directories are created from file paths. Passing them explicitly
  // makes the importer also emit an orphan empty-directory block, so only
  // empty directories (and an empty root) are passed as candidates.
  const parents = new Set(
    [...files.map((f) => f.path), ...directories].map((path) =>
      path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    )
  )
  function* candidates(): Generator<FileCandidate | DirectoryCandidate> {
    if (!parents.has('')) yield { path: name }
    for (const directory of directories) {
      if (!parents.has(directory)) yield { path: `${name}/${directory}` }
    }
    for (const file of files) {
      yield {
        path: `${name}/${file.path}`,
        content: createReadStream(join(root, file.path)),
      }
    }
  }

  let rootCid: CID | undefined
  try {
    for await (const entry of importer(
      candidates(),
      blockstore as never,
      IMPORTER_OPTIONS
    )) {
      if (entry.path === name) rootCid = entry.cid as unknown as CID
    }
    await writer.close()
    await written
  } catch (error) {
    await writer.close().catch(() => undefined)
    await written.catch(() => undefined)
    await rm(tmpPath, { force: true })
    throw error
  }
  if (!rootCid) throw new Error(`Packing ${dir} produced no root.`)

  const handle = await open(tmpPath, 'r+')
  try {
    await CarWriter.updateRootsInFile(handle, [rootCid])
  } finally {
    await handle.close()
  }
  const { size } = await lstat(tmpPath)
  await rename(tmpPath, carPath)
  return { rootCid, size, files: files.length }
}

/** Bytes read from a UnixFS file per exporter call during extraction. */
export const READ_WINDOW = 8 * 1024 * 1024

/**
 * Read a UnixFS file in bounded windows. The exporter pushes a file's blocks
 * into an unbounded queue without waiting for the consumer, so with a fast
 * local CAR one `content()` call buffers the whole file. Reading
 * `READ_WINDOW` bytes per call keeps memory bounded.
 */
async function* readWindows(
  node: {
    content: (options: {
      offset: number
      length: number
    }) => AsyncIterable<Uint8Array>
  },
  size: number
): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < size; offset += READ_WINDOW) {
    yield* node.content({
      offset,
      length: Math.min(READ_WINDOW, size - offset),
    })
  }
}

/** Multihash code for identity CIDs, whose digest is the block itself. */
const IDENTITY_CODE = 0x00

/**
 * Check that a block's bytes hash to its CID, like ipfs-car's `--verify`.
 * A CAR verified by PieceCID is already exact, but a CAR rebuilt by a
 * gateway (for example Curio `/ipfs/…?format=car`) is only trustworthy
 * block by block.
 *
 * @see https://github.com/storacha/ipfs-car
 */
export async function assertBlock(cid: CID, bytes: Uint8Array): Promise<void> {
  const { code, digest } = cid.multihash
  let actual: Uint8Array
  if (code === sha256.code) {
    actual = (await sha256.digest(bytes)).digest
  } else if (code === IDENTITY_CODE) {
    actual = bytes
  } else {
    throw new CliError({
      code: ErrorCodes.verificationFailed,
      message: `Unsupported multihash 0x${code.toString(16)} in block ${cid}.`,
    })
  }
  if (
    actual.length !== digest.length ||
    !actual.every((byte, i) => byte === digest[i])
  ) {
    throw new CliError({
      code: ErrorCodes.verificationFailed,
      message: `Block ${cid} does not match its CID.`,
    })
  }
}

/**
 * Extract a UnixFS CAR into `outDir`, verifying every block against its CID
 * and rejecting entries that would escape `outDir`. Returns the root CID read
 * from the CAR header.
 */
export async function extractCar(
  carPath: string,
  outDir: string
): Promise<{ rootCid: CID; files: number }> {
  const reader = await CarIndexedReader.fromFile(carPath)
  try {
    const [headerRoot] = await reader.getRoots()
    if (!headerRoot) throw new Error('CAR has no root.')
    // Normalize to this package's multiformats CID class for the exporter.
    const rootCid = CID.decode(headerRoot.bytes)
    const blockstore = {
      async *get(cid: CID) {
        const block = await reader.get(cid as never)
        if (!block) throw new Error(`Block ${cid} missing from CAR.`)
        await assertBlock(cid, block.bytes)
        yield block.bytes
      },
    }
    const target = resolve(outDir)
    let files = 0
    async function write(cid: CID, dest: string): Promise<void> {
      if (dest !== target && !dest.startsWith(target + sep)) {
        throw new CliError({
          code: ErrorCodes.unsafePath,
          message: `Refusing to write outside ${outDir}: ${dest}`,
        })
      }
      const node = await exporter(cid, blockstore as never)
      if (node.type === 'directory') {
        await mkdir(dest, { recursive: true })
        for await (const entry of node.entries()) {
          if (entry.name.includes('/') || entry.name.includes('\\')) {
            throw new CliError({
              code: ErrorCodes.unsafePath,
              message: `Refusing entry name with a path separator: ${entry.name}`,
            })
          }
          await write(entry.cid as unknown as CID, resolve(dest, entry.name))
        }
      } else if (node.type === 'file') {
        await mkdir(dirname(dest), { recursive: true })
        await pipeline(
          Readable.from(readWindows(node, Number(node.unixfs.fileSize()))),
          createWriteStream(dest)
        )
        files++
      } else if (node.type === 'raw' || node.type === 'identity') {
        await mkdir(dirname(dest), { recursive: true })
        await pipeline(
          Readable.from(node.content() as AsyncIterable<Uint8Array>),
          createWriteStream(dest)
        )
        files++
      }
    }
    await write(rootCid, target)
    return { rootCid, files }
  } finally {
    await reader.close()
  }
}
