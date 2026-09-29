import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import { openDatabase } from '../src/state/db.ts'
import {
  acquireOperation,
  createOperation,
  getOperation,
  listOperations,
  updateOperation,
} from '../src/state/operations.ts'
import {
  findResourcesByCid,
  listResources,
  type Resource,
  saveResource,
  setResourceStatus,
} from '../src/state/resources.ts'
import { tempDir } from './helpers.ts'

const scope = { chainId: '314159', payer: '0xabc' }

/** A resource fixture. */
function resource(ref: string, createdAt: string): Resource {
  return {
    ref,
    kind: 'artifact',
    name: 'site',
    ...scope,
    pieceCid: `piece-${ref}`,
    rootCid: `root-${ref}`,
    size: 1024,
    copies: [
      {
        providerId: '1',
        dataSetId: '2',
        pieceId: '3',
        serviceURL: 'https://sp',
      },
    ],
    url: 'https://sp/ipfs/root/',
    status: 'active',
    createdAt,
  }
}

test('migrations are idempotent', async () => {
  const dir = await tempDir()
  openDatabase(dir).close()
  const db = openDatabase(dir)
  const row = db.prepare('PRAGMA user_version').get() as {
    user_version: number
  }
  assert.equal(row.user_version, 1)
  db.close()
})

test('resources round-trip and list newest first', async () => {
  const db = openDatabase(await tempDir())
  saveResource(db, resource('res_a', '2026-01-01T00:00:00Z'))
  saveResource(db, resource('res_b', '2026-01-02T00:00:00Z'))
  const listed = listResources(db, { ...scope, limit: 10 })
  assert.deepEqual(
    listed.map((r) => r.ref),
    ['res_b', 'res_a']
  )
  assert.deepEqual(listed[1], resource('res_a', '2026-01-01T00:00:00Z'))
  assert.equal(findResourcesByCid(db, scope, 'root-res_a')[0]?.ref, 'res_a')
  assert.equal(
    listResources(db, { ...scope, payer: '0xdef', limit: 10 }).length,
    0
  )

  setResourceStatus(db, 'res_a', 'removal_pending')
  assert.equal(listResources(db, { ...scope, limit: 10 }).length, 1)
  assert.equal(listResources(db, { ...scope, limit: 10, all: true }).length, 2)
})

test('operations merge checkpoints and filter incomplete jobs', async () => {
  const db = openDatabase(await tempDir())
  const op = createOperation(db, {
    action: 'put',
    resourceRef: 'res_x',
    ...scope,
    input: { sourcePath: '/tmp/x', kind: 'file' },
  })
  assert.equal(op.phase, 'queued')
  assert.equal(op.executionStatus, 'pending')
  updateOperation(db, op.id, {
    checkpoint: { pieceCid: 'p' },
    phase: 'storing',
  })
  updateOperation(db, op.id, { checkpoint: { statusUrl: 's' } })
  assert.deepEqual(getOperation(db, op.id)?.checkpoint, {
    pieceCid: 'p',
    statusUrl: 's',
  })
  assert.equal(
    listOperations(db, { ...scope, limit: 10, incomplete: true }).length,
    1
  )
  updateOperation(db, op.id, { executionStatus: 'completed' })
  assert.equal(
    listOperations(db, { ...scope, limit: 10, incomplete: true }).length,
    0
  )
})

test('acquireOperation refuses a job held by a live process', async () => {
  const db = openDatabase(await tempDir())
  const op = createOperation(db, {
    action: 'put',
    resourceRef: 'res_y',
    ...scope,
    input: {},
  })
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'])
  try {
    updateOperation(db, op.id, { executionStatus: 'running', pid: child.pid })
    assert.throws(() => acquireOperation(db, op.id), {
      code: 'OPERATION_LOCKED',
    })
  } finally {
    child.kill()
  }
  await new Promise((resolve) => child.once('exit', resolve))
  const taken = acquireOperation(db, op.id)
  assert.equal(taken.pid, process.pid)
  assert.equal(taken.executionStatus, 'running')
})
