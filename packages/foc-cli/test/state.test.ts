import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { openDatabase } from '../src/state/db.ts'
import {
  acquireOperation,
  createOperation,
  getOperation,
  listOperations,
  releaseOperation,
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
  assert.equal(row.user_version, 2)
  db.close()
})

test('resources round-trip and list newest first', async () => {
  const db = openDatabase(await tempDir())
  saveResource(db, resource('res_a', '2026-01-01T00:00:00Z'))
  saveResource(db, resource('res_b', '2026-01-02T00:00:00Z'))
  const listed = listResources(db, { ...scope, limit: 10 }).items
  assert.deepEqual(
    listed.map((r) => r.ref),
    ['res_b', 'res_a']
  )
  assert.deepEqual(listed[1], resource('res_a', '2026-01-01T00:00:00Z'))
  assert.equal(findResourcesByCid(db, scope, 'root-res_a')[0]?.ref, 'res_a')
  assert.equal(
    listResources(db, { ...scope, payer: '0xdef', limit: 10 }).items.length,
    0
  )

  setResourceStatus(db, 'res_a', 'removal_pending')
  assert.equal(listResources(db, { ...scope, limit: 10 }).items.length, 1)
  assert.equal(
    listResources(db, { ...scope, limit: 10, all: true }).items.length,
    2
  )
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
    listOperations(db, { ...scope, limit: 10, incomplete: true }).items.length,
    1
  )
  updateOperation(db, op.id, { executionStatus: 'completed' })
  assert.equal(
    listOperations(db, { ...scope, limit: 10, incomplete: true }).items.length,
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
      code: 'operation_running',
    })
  } finally {
    child.kill()
  }
  await new Promise((resolve) => child.once('exit', resolve))
  const taken = acquireOperation(db, op.id)
  assert.equal(taken.pid, process.pid)
  assert.equal(taken.executionStatus, 'running')
  releaseOperation(op.id)
})

test('acquireOperation refuses a second caller in the same process', async () => {
  const db = openDatabase(await tempDir())
  const op = createOperation(db, {
    action: 'put',
    resourceRef: 'res_z',
    ...scope,
    input: {},
  })
  acquireOperation(db, op.id)
  try {
    assert.throws(() => acquireOperation(db, op.id), {
      code: 'operation_running',
    })
  } finally {
    releaseOperation(op.id)
  }
})

test('acquireOperation takes over a job left running under a reused PID', async () => {
  const db = openDatabase(await tempDir())
  const op = createOperation(db, {
    action: 'delete',
    resourceRef: 'res_w',
    ...scope,
    input: {},
  })
  // A crashed run whose PID now belongs to this process.
  updateOperation(db, op.id, { executionStatus: 'running', pid: process.pid })
  const taken = acquireOperation(db, op.id)
  assert.equal(taken.executionStatus, 'running')
  releaseOperation(op.id)
})

test('lists page with nextCursor', async () => {
  const db = openDatabase(await tempDir())
  for (const day of [1, 2, 3, 4, 5]) {
    saveResource(db, resource(`res_${day}`, `2026-01-0${day}T00:00:00Z`))
  }
  const first = listResources(db, { ...scope, limit: 2 })
  assert.deepEqual(
    first.items.map((r) => r.ref),
    ['res_5', 'res_4']
  )
  assert.ok(first.nextCursor)
  const second = listResources(db, {
    ...scope,
    limit: 2,
    cursor: first.nextCursor,
  })
  assert.deepEqual(
    second.items.map((r) => r.ref),
    ['res_3', 'res_2']
  )
  const last = listResources(db, {
    ...scope,
    limit: 2,
    cursor: second.nextCursor,
  })
  assert.deepEqual(
    last.items.map((r) => r.ref),
    ['res_1']
  )
  assert.equal(last.nextCursor, undefined)
  assert.throws(() => listResources(db, { ...scope, limit: 2, cursor: 'x' }), {
    code: 'invalid_input',
  })
})

test('migration renames saved rm operations to delete', async () => {
  const dir = await tempDir()
  const raw = new DatabaseSync(join(dir, 'state.db'))
  raw.exec(`
    CREATE TABLE resources (ref TEXT PRIMARY KEY, kind TEXT, name TEXT,
      chain_id TEXT, payer TEXT, piece_cid TEXT, root_cid TEXT, size INTEGER,
      copies TEXT, url TEXT, status TEXT, created_at TEXT);
    CREATE TABLE operations (id TEXT PRIMARY KEY,
      action TEXT NOT NULL CHECK (action IN ('put', 'rm')),
      resource_ref TEXT, chain_id TEXT, payer TEXT, execution_status TEXT,
      phase TEXT, input TEXT, checkpoint TEXT, pid INTEGER, error TEXT,
      created_at TEXT, updated_at TEXT);
    INSERT INTO operations VALUES ('op_old', 'rm', 'res_a', '314159', '0xabc',
      'completed', 'done', '{}', '{}', NULL, NULL, 't', 't');
    PRAGMA user_version = 1;
  `)
  raw.close()
  const db = openDatabase(dir)
  assert.equal(getOperation(db, 'op_old')?.action, 'delete')
})
