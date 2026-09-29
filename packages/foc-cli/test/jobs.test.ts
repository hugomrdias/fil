import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Hex } from 'viem'
import { openDatabase } from '../src/state/db.ts'
import { getOperation, listOperations } from '../src/state/operations.ts'
import { getResource } from '../src/state/resources.ts'
import {
  ARTIFACT_DATA_SET_METADATA,
  FILE_DATA_SET_METADATA,
  type JobContext,
  runOperation,
  startPut,
  startRemove,
} from '../src/storage/jobs.ts'
import type { StorageBackend } from '../src/storage/types.ts'
import { tempDir } from './helpers.ts'

const TX = `0x${'aa'.repeat(32)}` as Hex

/** Calls recorded by {@link fakeBackend}. */
type Calls = {
  select: unknown[]
  upload: number
  add: number
  create: number
  wait: number
  remove: number
}

/**
 * A storage backend that records calls. `failWaitOnce` makes the first
 * commit wait throw, simulating an interruption after submission.
 */
function fakeBackend(
  options: {
    existingDataSet?: boolean
    failWaitOnce?: boolean
    stored?: boolean
  } = {}
) {
  const calls: Calls = {
    select: [],
    upload: 0,
    add: 0,
    create: 0,
    wait: 0,
    remove: 0,
  }
  let failWait = options.failWaitOnce ?? false
  const backend: StorageBackend = {
    selectPlacement(opts) {
      calls.select.push(opts.metadata)
      return Promise.resolve({
        providerId: 7n,
        serviceURL: 'https://sp.example',
        payee: '0x0000000000000000000000000000000000000007',
        ...(options.existingDataSet
          ? { dataSetId: 42n, clientDataSetId: 9n }
          : {}),
      })
    },
    assertFunded: () => Promise.resolve(),
    hasPiece: () => Promise.resolve(options.stored ?? false),
    upload() {
      calls.upload++
      return Promise.resolve()
    },
    addPiece() {
      calls.add++
      return Promise.resolve({
        transactionHash: TX,
        statusUrl: 'https://sp.example/status/add',
      })
    },
    createDataSetWithPiece() {
      calls.create++
      return Promise.resolve({
        transactionHash: TX,
        statusUrl: 'https://sp.example/status/create',
      })
    },
    waitForCommit({ created }) {
      calls.wait++
      if (failWait) {
        failWait = false
        return Promise.reject(new Error('connection reset'))
      }
      return Promise.resolve({ dataSetId: created ? 100n : 42n, pieceId: 5n })
    },
    schedulePieceRemoval() {
      calls.remove++
      return Promise.resolve({ transactionHash: TX })
    },
    waitForTransaction: () => Promise.resolve(),
  }
  return { backend, calls }
}

/** Build a job context over a fresh database. */
async function context(
  backend: StorageBackend
): Promise<JobContext & { root: string }> {
  const root = await tempDir()
  return {
    root,
    db: openDatabase(join(root, 'state')),
    backend,
    chainId: '314159',
    payer: '0xpayer',
    stagingDir: (id) => join(root, 'state', 'staging', id),
  }
}

test('put stores a file in a new data set and records the resource', async () => {
  const { backend, calls } = fakeBackend()
  const ctx = await context(backend)
  const file = join(ctx.root, 'report.pdf')
  await writeFile(file, randomBytes(4096))

  const result = await startPut(ctx, { path: file })
  assert.equal(result.state, 'ready')
  assert.equal(result.resource.kind, 'file')
  assert.equal(result.resource.name, 'report.pdf')
  assert.deepEqual(result.resource.copies, [
    {
      providerId: '7',
      dataSetId: '100',
      pieceId: '5',
      serviceURL: 'https://sp.example',
    },
  ])
  assert.equal(
    result.urls.piece,
    `https://sp.example/piece/${result.resource.pieceCid}`
  )
  assert.deepEqual(calls.select, [FILE_DATA_SET_METADATA])
  assert.equal(calls.create, 1)
  assert.equal(
    getResource(ctx.db, result.resource.ref)?.pieceCid,
    result.resource.pieceCid
  )
  const op = getOperation(ctx.db, result.operationId)
  assert.equal(op?.executionStatus, 'completed')
  assert.equal(op?.phase, 'done')
})

test('put packs a directory, adds to an existing data set, and cleans staging', async () => {
  const { backend, calls } = fakeBackend({ existingDataSet: true })
  const ctx = await context(backend)
  const dir = join(ctx.root, 'site')
  await mkdir(dir)
  await writeFile(join(dir, 'index.html'), '<h1>hello world</h1>')

  const result = await startPut(ctx, { path: dir })
  assert.equal(result.resource.kind, 'artifact')
  assert.ok(result.resource.rootCid)
  assert.equal(
    result.urls.ipfs,
    `https://sp.example/ipfs/${result.resource.rootCid}/`
  )
  assert.equal(result.resource.url, result.urls.ipfs)
  assert.deepEqual(calls.select, [ARTIFACT_DATA_SET_METADATA])
  assert.equal(calls.add, 1)
  assert.equal(calls.create, 0)
  await assert.rejects(stat(ctx.stagingDir(result.operationId)), {
    code: 'ENOENT',
  })
})

test('resume after an interrupted commit waits without resubmitting', async () => {
  const { backend, calls } = fakeBackend({ failWaitOnce: true })
  const ctx = await context(backend)
  const file = join(ctx.root, 'data.bin')
  await writeFile(file, randomBytes(2048))

  await assert.rejects(startPut(ctx, { path: file }), {
    code: 'OPERATION_FAILED',
  })
  const [failed] = listOperations(ctx.db, {
    chainId: ctx.chainId,
    payer: ctx.payer,
    limit: 1,
    incomplete: true,
  })
  assert.ok(failed)
  assert.equal(failed.executionStatus, 'failed')
  assert.equal(failed.checkpoint.statusUrl, 'https://sp.example/status/create')

  const result = await runOperation(ctx, failed.id)
  assert.equal(result.state, 'ready')
  assert.equal(calls.upload, 1)
  assert.equal(calls.create, 1)
  assert.equal(calls.wait, 2)
  assert.equal(calls.select.length, 1)
})

test('put skips the upload when the provider already has the piece', async () => {
  const { backend, calls } = fakeBackend({ stored: true })
  const ctx = await context(backend)
  const file = join(ctx.root, 'data.bin')
  await writeFile(file, randomBytes(1024))
  await startPut(ctx, { path: file })
  assert.equal(calls.upload, 0)
  assert.equal(calls.create, 1)
})

test('resume refuses a source that changed since the job started', async () => {
  const { backend } = fakeBackend({ failWaitOnce: true })
  const ctx = await context(backend)
  const file = join(ctx.root, 'data.bin')
  await writeFile(file, randomBytes(1024))
  await assert.rejects(startPut(ctx, { path: file }))
  const [failed] = listOperations(ctx.db, {
    chainId: ctx.chainId,
    payer: ctx.payer,
    limit: 1,
  })
  assert.ok(failed)
  await writeFile(file, randomBytes(1024))
  await assert.rejects(runOperation(ctx, failed.id), { code: 'SOURCE_CHANGED' })
})

test('put rejects content below the minimum piece size', async () => {
  const { backend } = fakeBackend()
  const ctx = await context(backend)
  const file = join(ctx.root, 'tiny.txt')
  await writeFile(file, 'hi')
  await assert.rejects(startPut(ctx, { path: file }), { code: 'INVALID_SIZE' })
})

test('rm schedules removal and marks the resource pending', async () => {
  const { backend, calls } = fakeBackend()
  const ctx = await context(backend)
  const file = join(ctx.root, 'data.bin')
  await writeFile(file, randomBytes(1024))
  const put = await startPut(ctx, { path: file })

  const removed = await startRemove(ctx, put.resource.ref)
  assert.equal(removed.state, 'removal_pending')
  assert.equal(calls.remove, 1)
  assert.equal(getResource(ctx.db, put.resource.ref)?.status, 'removal_pending')
  await assert.rejects(startRemove(ctx, 'res_missing'), { code: 'NOT_FOUND' })
})
