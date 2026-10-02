import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { CliError } from 'clipact'
import type { Hex } from 'viem'
import { openDatabase } from '../src/state/db.ts'
import {
  getOperation,
  listOperations,
  type SignedCommit,
} from '../src/state/operations.ts'
import { getResource } from '../src/state/resources.ts'
import {
  ARTIFACT_DATA_SET_METADATA,
  estimatePut,
  FILE_DATA_SET_METADATA,
  type JobContext,
  runOperation,
  startPut,
  startRemove,
} from '../src/storage/jobs.ts'
import type { CommittedPiece, StorageBackend } from '../src/storage/types.ts'
import { tempDir } from './helpers.ts'

const TX = `0x${'aa'.repeat(32)}` as Hex

/** Options for {@link fakeBackend}. */
type FakeOptions = {
  existingDataSet?: boolean
  stored?: boolean
  /** The payer cannot afford the upload. */
  unfunded?: boolean
  /** The first commit wait fails, as if the connection dropped. */
  failWaitOnce?: boolean
  /** The first submission lands on chain but its response is lost. */
  loseResponseOnce?: boolean
  /** The first submission fails before reaching the provider. */
  failSubmitOnce?: boolean
  /** The first commit transaction is reported as failed. */
  rejectOnce?: boolean
  /** The first removal transaction reverts. */
  revertOnce?: boolean
}

/**
 * A storage backend that records calls and simulates FWSS: a submitted
 * commit lands under its nonce unless it is rejected, and `findCommit` reads
 * that record the way `clientNonces` does.
 */
function fakeBackend(options: FakeOptions = {}) {
  const calls = {
    select: [] as unknown[],
    upload: 0,
    sign: 0,
    submitted: [] as Hex[],
    find: 0,
    wait: 0,
    remove: 0,
  }
  const landed = new Map<string, CommittedPiece>()
  const once = { ...options }
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
    quote: () =>
      Promise.resolve({
        ready: !options.unfunded,
        depositNeeded: options.unfunded ? 10n ** 18n : 0n,
        needsApproval: false,
        ratePerMonth: 123n,
        lockup: 456n,
        fundingUrl: 'https://pay.example/console',
      }),
    hasPiece: () => Promise.resolve(options.stored ?? false),
    upload() {
      calls.upload++
      return Promise.resolve()
    },
    signCommit({ placement }) {
      calls.sign++
      const commit: SignedCommit = {
        created: placement.dataSetId == null,
        nonce: String(calls.sign),
        extraData: `0x0${calls.sign}`,
      }
      return Promise.resolve(commit)
    },
    submitCommit({ commit }) {
      calls.submitted.push(commit.extraData)
      if (once.failSubmitOnce) {
        once.failSubmitOnce = false
        return Promise.reject(new Error('connect ECONNREFUSED'))
      }
      landed.set(commit.nonce, {
        dataSetId: commit.created ? 100n : 42n,
        pieceId: 5n,
      })
      if (once.loseResponseOnce) {
        once.loseResponseOnce = false
        return Promise.reject(new Error('socket hang up'))
      }
      return Promise.resolve({
        transactionHash: TX,
        statusUrl: `https://sp.example/status/${commit.nonce}`,
      })
    },
    findCommit({ nonce }) {
      calls.find++
      return Promise.resolve(landed.get(nonce.toString()))
    },
    waitForCommit({ statusUrl }) {
      calls.wait++
      const nonce = statusUrl.split('/').at(-1) ?? ''
      if (once.failWaitOnce) {
        once.failWaitOnce = false
        return Promise.reject(new Error('connection reset'))
      }
      if (once.rejectOnce) {
        once.rejectOnce = false
        landed.delete(nonce)
        return Promise.reject(
          new CliError({ code: 'commit_rejected', message: 'failed' })
        )
      }
      const piece = landed.get(nonce)
      if (!piece)
        return Promise.reject(new Error(`nothing landed for ${nonce}`))
      return Promise.resolve(piece)
    },
    schedulePieceRemoval() {
      calls.remove++
      return Promise.resolve({ transactionHash: TX })
    },
    waitForTransaction() {
      if (once.revertOnce) {
        once.revertOnce = false
        return Promise.resolve({ status: 'reverted' as const })
      }
      return Promise.resolve({ status: 'success' as const })
    },
  }
  return { backend, calls }
}

/** Build a job context over a fresh database. */
async function context(
  backend: StorageBackend
): Promise<JobContext & { root: string; started: string[] }> {
  const root = await tempDir()
  const started: string[] = []
  return {
    root,
    started,
    db: openDatabase(join(root, 'state')),
    backend,
    chainId: '314159',
    payer: '0xpayer',
    stagingDir: (id) => join(root, 'state', 'staging', id),
    onOperation: (op) => started.push(op.id),
  }
}

/** Write a random file of `size` bytes under the context root. */
async function file(ctx: { root: string }, name: string, size: number) {
  const path = join(ctx.root, name)
  await writeFile(path, randomBytes(size))
  return path
}

/** The only operation of a context's account. */
function onlyOperation(ctx: JobContext) {
  const { items } = listOperations(ctx.db, {
    chainId: ctx.chainId,
    payer: ctx.payer,
    limit: 2,
  })
  assert.equal(items.length, 1)
  return items[0] as NonNullable<(typeof items)[0]>
}

test('put stores a file in a new data set and records the resource', async () => {
  const { backend, calls } = fakeBackend()
  const ctx = await context(backend)
  const path = await file(ctx, 'report.pdf', 4096)

  const result = await startPut(ctx, { path })
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
  assert.equal(calls.submitted.length, 1)
  assert.deepEqual(ctx.started, [result.operationId])
  const op = getOperation(ctx.db, result.operationId)
  assert.equal(op?.executionStatus, 'completed')
  assert.equal(op?.phase, 'done')
  assert.equal(op?.pid, undefined)
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
  assert.equal(result.resource.copies[0]?.dataSetId, '42')
  await assert.rejects(stat(ctx.stagingDir(result.operationId)), {
    code: 'ENOENT',
  })
})

test('put errors carry the operation ID and a resume step, never retryable', async () => {
  const { backend } = fakeBackend({ failWaitOnce: true })
  const ctx = await context(backend)
  const path = await file(ctx, 'data.bin', 2048)

  const error = await startPut(ctx, { path }).catch((e: unknown) => e)
  assert.ok(error instanceof CliError)
  assert.equal(error.code, 'operation_failed')
  assert.equal(error.retryable, false)
  const op = onlyOperation(ctx)
  assert.equal(error.data?.operationId, op.id)
  assert.deepEqual(error.next?.at(-1), {
    by: 'agent',
    command: `fil operations resume ${op.id}`,
    description: 'Continue this operation with its saved input',
  })
  assert.equal(op.executionStatus, 'failed')
})

test('resume after a dropped wait finds the landed commit without sending', async () => {
  const { backend, calls } = fakeBackend({ failWaitOnce: true })
  const ctx = await context(backend)
  const path = await file(ctx, 'data.bin', 2048)
  await assert.rejects(startPut(ctx, { path }))
  const failed = onlyOperation(ctx)

  const result = await runOperation(ctx, failed.id)
  assert.equal(result.state, 'ready')
  assert.equal(calls.upload, 1)
  assert.equal(calls.sign, 1)
  assert.equal(calls.submitted.length, 1)
  assert.equal(calls.select.length, 1)
})

test('resume after a lost commit response does not commit twice (#1)', async () => {
  const { backend, calls } = fakeBackend({ loseResponseOnce: true })
  const ctx = await context(backend)
  const path = await file(ctx, 'data.bin', 2048)
  await assert.rejects(startPut(ctx, { path }), { code: 'operation_failed' })
  const failed = onlyOperation(ctx)
  assert.equal(failed.checkpoint.statusUrl, undefined)
  assert.ok(failed.checkpoint.commit)

  const result = await runOperation(ctx, failed.id)
  assert.equal(result.resource.copies[0]?.dataSetId, '100')
  assert.equal(calls.sign, 1)
  assert.equal(calls.submitted.length, 1)
})

test('resume resends the same signature when the commit never landed (#1)', async () => {
  const { backend, calls } = fakeBackend({ failSubmitOnce: true })
  const ctx = await context(backend)
  const path = await file(ctx, 'data.bin', 2048)
  await assert.rejects(startPut(ctx, { path }))
  const failed = onlyOperation(ctx)

  await runOperation(ctx, failed.id)
  assert.equal(calls.sign, 1)
  assert.equal(calls.submitted.length, 2)
  assert.equal(calls.submitted[0], calls.submitted[1])
})

test('a rejected commit is resent with the same signature on resume', async () => {
  const { backend, calls } = fakeBackend({ rejectOnce: true })
  const ctx = await context(backend)
  const path = await file(ctx, 'data.bin', 2048)
  await assert.rejects(startPut(ctx, { path }), { code: 'commit_rejected' })
  const failed = onlyOperation(ctx)
  assert.equal(failed.checkpoint.statusUrl, undefined)

  const result = await runOperation(ctx, failed.id)
  assert.equal(result.state, 'ready')
  assert.equal(calls.sign, 1)
  assert.deepEqual(calls.submitted, ['0x01', '0x01'])
})

test('resume of a completed operation returns its saved outcome (#4)', async () => {
  const { backend, calls } = fakeBackend()
  const ctx = await context(backend)
  const path = await file(ctx, 'data.bin', 1024)
  const put = await startPut(ctx, { path })

  const again = await runOperation(ctx, put.operationId)
  assert.deepEqual(again, put)
  assert.equal(calls.submitted.length, 1)
  assert.equal(calls.upload, 1)
})

test('put stops with insufficient_funds, a funding step, and the operation', async () => {
  const { backend, calls } = fakeBackend({ unfunded: true })
  const ctx = await context(backend)
  const path = await file(ctx, 'data.bin', 1024)
  const error = await startPut(ctx, { path }).catch((e: unknown) => e)
  assert.ok(error instanceof CliError)
  assert.equal(error.code, 'insufficient_funds')
  assert.deepEqual(
    error.next?.map((step) => step.by),
    ['user', 'agent']
  )
  assert.equal(error.data?.operationId, onlyOperation(ctx).id)
  assert.equal(calls.upload, 0)
})

test('put skips the upload when the provider already has the piece', async () => {
  const { backend, calls } = fakeBackend({ stored: true })
  const ctx = await context(backend)
  const path = await file(ctx, 'data.bin', 1024)
  await startPut(ctx, { path })
  assert.equal(calls.upload, 0)
  assert.equal(calls.submitted.length, 1)
})

test('resume refuses a source that changed since the job started', async () => {
  const { backend } = fakeBackend({ failWaitOnce: true })
  const ctx = await context(backend)
  const path = await file(ctx, 'data.bin', 1024)
  await assert.rejects(startPut(ctx, { path }))
  const failed = onlyOperation(ctx)
  await writeFile(path, randomBytes(1024))
  await assert.rejects(runOperation(ctx, failed.id), {
    code: 'source_changed',
  })
})

test('put rejects content below the minimum piece size', async () => {
  const { backend } = fakeBackend()
  const ctx = await context(backend)
  const path = join(ctx.root, 'tiny.txt')
  await writeFile(path, 'hi')
  await assert.rejects(startPut(ctx, { path }), { code: 'invalid_input' })
})

test('an interrupted put fails with the abort reason, not operation_failed', async () => {
  const { backend } = fakeBackend()
  const controller = new AbortController()
  const ctx = await context({
    ...backend,
    upload() {
      controller.abort('SIGTERM')
      return Promise.reject(new Error('aborted'))
    },
  })
  ctx.signal = controller.signal
  const path = await file(ctx, 'data.bin', 1024)
  await assert.rejects(startPut(ctx, { path }), { message: 'aborted' })
  const op = onlyOperation(ctx)
  assert.equal(op.executionStatus, 'failed')
  assert.equal(op.error, 'Interrupted')
})

test('delete schedules removal and marks the resource pending', async () => {
  const { backend, calls } = fakeBackend()
  const ctx = await context(backend)
  const path = await file(ctx, 'data.bin', 1024)
  const put = await startPut(ctx, { path })

  const removed = await startRemove(ctx, put.resource.ref)
  assert.equal(removed.state, 'removal_pending')
  assert.equal(calls.remove, 1)
  assert.equal(getResource(ctx.db, put.resource.ref)?.status, 'removal_pending')
  assert.equal(
    getOperation(ctx.db, removed.operationId)?.executionStatus,
    'completed'
  )
  await assert.rejects(startRemove(ctx, 'res_missing'), { code: 'not_found' })
  await assert.rejects(startRemove(ctx, put.resource.ref), {
    code: 'invalid_input',
  })
})

test('a reverted removal keeps the resource and is resumable (#2)', async () => {
  const { backend, calls } = fakeBackend({ revertOnce: true })
  const ctx = await context(backend)
  const path = await file(ctx, 'data.bin', 1024)
  const put = await startPut(ctx, { path })

  const error = await startRemove(ctx, put.resource.ref).catch(
    (e: unknown) => e
  )
  assert.ok(error instanceof CliError)
  assert.equal(error.code, 'removal_reverted')
  assert.equal(getResource(ctx.db, put.resource.ref)?.status, 'active')
  const operationId = error.data?.operationId as string
  const failed = getOperation(ctx.db, operationId)
  assert.equal(failed?.executionStatus, 'failed')
  assert.equal(failed?.checkpoint.transactionHash, undefined)

  const resumed = await runOperation(ctx, operationId)
  assert.equal(resumed.state, 'removal_pending')
  assert.equal(calls.remove, 2)
})

test('estimatePut sizes a directory and prices it without side effects', async () => {
  const { backend, calls } = fakeBackend()
  const ctx = await context(backend)
  const dir = join(ctx.root, 'site')
  await mkdir(join(dir, 'assets'), { recursive: true })
  await writeFile(join(dir, 'index.html'), '<h1>hello world</h1>')
  await writeFile(join(dir, 'assets', 'app.js'), 'console.log(1)'.repeat(20))

  const estimate = await estimatePut({
    path: dir,
    scratchDir: ctx.root,
    backend,
  })
  assert.equal(estimate.kind, 'artifact')
  assert.equal(estimate.files, 2)
  assert.ok(estimate.rootCid)
  assert.ok(estimate.size > 0)
  assert.equal(estimate.quote?.ratePerMonth, 123n)
  assert.equal(estimate.placement?.providerId, 7n)
  assert.equal(calls.upload + calls.sign + calls.submitted.length, 0)

  const offline = await estimatePut({ path: dir, scratchDir: ctx.root })
  assert.equal(offline.quote, undefined)
  assert.equal(offline.rootCid, estimate.rootCid)
})
