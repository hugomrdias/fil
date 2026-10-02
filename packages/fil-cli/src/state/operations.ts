import type { DatabaseSync } from 'node:sqlite'
import { CliError } from 'clipact'
import { ErrorCodes, notFound } from '../errors.ts'
import { decodeCursor, encodeCursor, type Page } from './cursor.ts'
import { createId } from './ids.ts'

/** Canonical saved command. */
export type OperationAction = 'put' | 'delete'

/** Job execution state. */
export type ExecutionStatus = 'pending' | 'running' | 'failed' | 'completed'

/** Current step of a job. */
export type Phase =
  | 'queued'
  | 'packing'
  | 'storing'
  | 'committing'
  | 'removing'
  | 'done'

/** Saved command input, used to resume with the original arguments. */
export type OperationInput = {
  sourcePath?: string
  name?: string
  kind?: 'file' | 'artifact'
  providerId?: string
}

/**
 * A commit signed before it is sent, so a resume can tell whether it landed
 * and, if not, send the same signature again.
 */
export type SignedCommit = {
  /** `true` when the commit also creates the data set. */
  created: boolean
  /** Add-pieces nonce; FWSS records it in `clientNonces` when the commit lands. */
  nonce: string
  /** Client data set ID of a new data set. */
  clientDataSetId?: string
  extraData: `0x${string}`
}

/**
 * Progress saved as an operation advances. Values that are bigints on chain
 * are decimal strings. Each field is written before the step that depends on
 * it, so a resumed job never repeats a confirmed mutation.
 */
export type Checkpoint = {
  pieceCid?: string
  rootCid?: string
  size?: number
  providerId?: string
  serviceURL?: string
  payee?: string
  /** Existing data set to add to; absent when a new one is created. */
  dataSetId?: string
  clientDataSetId?: string
  /** Set once the provider has parked the piece. */
  stored?: boolean
  /** Signed commit, saved before it is sent. */
  commit?: SignedCommit
  /** Provider status URL for the commit or removal submission. */
  statusUrl?: string
  transactionHash?: string
  pieceId?: string
  confirmed?: boolean
}

/**
 * A saved `put` or `delete` job with enough progress to continue after an
 * interruption.
 *
 * @see ../../../../docs/foc-cli-interface-research.md#operations
 */
export type Operation = {
  id: string
  action: OperationAction
  resourceRef: string
  chainId: string
  payer: string
  executionStatus: ExecutionStatus
  phase: Phase
  input: OperationInput
  checkpoint: Checkpoint
  pid?: number
  error?: string
  createdAt: string
  updatedAt: string
}

/** Row shape of the `operations` table. */
type OperationRow = {
  id: string
  action: OperationAction
  resource_ref: string
  chain_id: string
  payer: string
  execution_status: ExecutionStatus
  phase: Phase
  input: string
  checkpoint: string
  pid: number | null
  error: string | null
  created_at: string
  updated_at: string
}

/** Convert a database row to an {@link Operation}. */
function fromRow(row: OperationRow): Operation {
  return {
    id: row.id,
    action: row.action,
    resourceRef: row.resource_ref,
    chainId: row.chain_id,
    payer: row.payer,
    executionStatus: row.execution_status,
    phase: row.phase,
    input: JSON.parse(row.input) as OperationInput,
    checkpoint: JSON.parse(row.checkpoint) as Checkpoint,
    ...(row.pid == null ? {} : { pid: row.pid }),
    ...(row.error ? { error: row.error } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Options for {@link createOperation}. */
export type CreateOperationOptions = {
  action: OperationAction
  resourceRef: string
  chainId: string
  payer: string
  input: OperationInput
  checkpoint?: Checkpoint
}

/** Save a new queued operation before any external mutation. */
export function createOperation(
  db: DatabaseSync,
  options: CreateOperationOptions
): Operation {
  const now = new Date().toISOString()
  const id = createId('op')
  db.prepare(
    `INSERT INTO operations
      (id, action, resource_ref, chain_id, payer, execution_status, phase, input, checkpoint, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 'queued', ?, ?, ?, ?)`
  ).run(
    id,
    options.action,
    options.resourceRef,
    options.chainId,
    options.payer,
    JSON.stringify(options.input),
    JSON.stringify(options.checkpoint ?? {}),
    now,
    now
  )
  return getOperation(db, id) as Operation
}

/** Get an operation by ID. */
export function getOperation(
  db: DatabaseSync,
  id: string
): Operation | undefined {
  const row = db.prepare('SELECT * FROM operations WHERE id = ?').get(id) as
    | OperationRow
    | undefined
  return row ? fromRow(row) : undefined
}

/** Options for {@link listOperations}. */
export type ListOperationsOptions = {
  chainId: string
  payer: string
  limit: number
  /** `nextCursor` of the previous page. */
  cursor?: string | undefined
  /** Only jobs that have not completed. */
  incomplete?: boolean
}

/**
 * List operations for an account scope, most recently updated first, one
 * page at a time.
 */
export function listOperations(
  db: DatabaseSync,
  options: ListOperationsOptions
): Page<Operation> {
  const after = options.cursor ? decodeCursor(options.cursor) : undefined
  const rows = db
    .prepare(
      `SELECT * FROM operations
       WHERE chain_id = ? AND payer = ? ${options.incomplete ? "AND execution_status != 'completed'" : ''}
       ${after ? 'AND (updated_at, id) < (?, ?)' : ''}
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`
    )
    .all(
      options.chainId,
      options.payer,
      ...(after ?? []),
      options.limit + 1
    ) as OperationRow[]
  const items = rows.slice(0, options.limit).map(fromRow)
  const last = items.at(-1)
  return rows.length > options.limit && last
    ? { items, nextCursor: encodeCursor(last.updatedAt, last.id) }
    : { items }
}

/** Fields that {@link updateOperation} can change. */
export type OperationUpdate = {
  phase?: Phase
  executionStatus?: ExecutionStatus
  checkpoint?: Checkpoint
  error?: string | null
  pid?: number | null
}

/**
 * Update an operation. `checkpoint` is merged into the saved checkpoint so
 * callers only pass what changed.
 */
export function updateOperation(
  db: DatabaseSync,
  id: string,
  update: OperationUpdate
): Operation {
  const current = getOperation(db, id)
  if (!current) throw notFound(`Operation ${id} not found.`)
  const checkpoint = { ...current.checkpoint, ...update.checkpoint }
  const error =
    update.error === undefined ? (current.error ?? null) : update.error
  const pid = update.pid === undefined ? (current.pid ?? null) : update.pid
  db.prepare(
    `UPDATE operations
     SET phase = ?, execution_status = ?, checkpoint = ?, error = ?, pid = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    update.phase ?? current.phase,
    update.executionStatus ?? current.executionStatus,
    JSON.stringify(checkpoint),
    error,
    pid,
    new Date().toISOString(),
    id
  )
  return getOperation(db, id) as Operation
}

/** Whether a process with `pid` is still running. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Operations whose lock this process holds. A `running` row with this
 * process's PID is only locked when its ID is here; otherwise the PID was
 * reused after a crash and the job can be taken over.
 */
const held = new Set<string>()

/** Error returned when another caller holds an operation. */
function operationRunning(id: string, pid: number): CliError {
  return new CliError({
    code: ErrorCodes.operationRunning,
    message:
      pid === process.pid
        ? `Operation ${id} is already running in this process.`
        : `Operation ${id} is running in process ${pid}.`,
    next: [
      {
        by: 'agent',
        command: `fil operations inspect ${id}`,
        description: 'Check its progress; resume it once it stops',
      },
    ],
  })
}

/**
 * Take the execution lock for an operation. Fails when another live process,
 * or another call in this process, holds it. A `running` job whose process
 * has exited is treated as interrupted and can be taken over. Release the
 * lock with {@link releaseOperation}.
 */
export function acquireOperation(db: DatabaseSync, id: string): Operation {
  const current = getOperation(db, id)
  if (!current) throw notFound(`Operation ${id} not found.`)
  if (current.executionStatus === 'running' && current.pid != null) {
    const mine = current.pid === process.pid
    if (mine ? held.has(id) : isAlive(current.pid)) {
      throw operationRunning(id, current.pid)
    }
  }
  if (held.has(id)) throw operationRunning(id, process.pid)
  const result = db
    .prepare(
      `UPDATE operations
       SET execution_status = 'running', pid = ?, error = NULL, updated_at = ?
       WHERE id = ? AND execution_status = ? AND pid IS ?`
    )
    .run(
      process.pid,
      new Date().toISOString(),
      id,
      current.executionStatus,
      current.pid ?? null
    )
  if (result.changes !== 1) throw operationRunning(id, current.pid ?? 0)
  held.add(id)
  return getOperation(db, id) as Operation
}

/** Release a lock taken by {@link acquireOperation} in this process. */
export function releaseOperation(id: string): void {
  held.delete(id)
}
