import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import envPaths from 'env-paths'

/**
 * Schema migrations, applied in order. `PRAGMA user_version` records how many
 * have run. Append new migrations; never edit applied ones.
 */
const MIGRATIONS = [
  `
  CREATE TABLE resources (
    ref TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('file', 'artifact')),
    name TEXT NOT NULL,
    chain_id TEXT NOT NULL,
    payer TEXT NOT NULL,
    piece_cid TEXT NOT NULL,
    root_cid TEXT,
    size INTEGER NOT NULL,
    copies TEXT NOT NULL DEFAULT '[]',
    url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  );
  CREATE INDEX resources_scope ON resources (chain_id, payer, created_at);

  CREATE TABLE operations (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL CHECK (action IN ('put', 'rm')),
    resource_ref TEXT NOT NULL,
    chain_id TEXT NOT NULL,
    payer TEXT NOT NULL,
    execution_status TEXT NOT NULL,
    phase TEXT NOT NULL,
    input TEXT NOT NULL DEFAULT '{}',
    checkpoint TEXT NOT NULL DEFAULT '{}',
    pid INTEGER,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX operations_scope ON operations (chain_id, payer, updated_at);
  CREATE INDEX operations_status ON operations (execution_status, updated_at);
  `,
  // Rename the `rm` action to `delete`, the research doc's verb. SQLite
  // cannot change a CHECK constraint in place, so the table is rebuilt.
  `
  CREATE TABLE operations_next (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL CHECK (action IN ('put', 'delete')),
    resource_ref TEXT NOT NULL,
    chain_id TEXT NOT NULL,
    payer TEXT NOT NULL,
    execution_status TEXT NOT NULL,
    phase TEXT NOT NULL,
    input TEXT NOT NULL DEFAULT '{}',
    checkpoint TEXT NOT NULL DEFAULT '{}',
    pid INTEGER,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO operations_next
    SELECT id, CASE action WHEN 'rm' THEN 'delete' ELSE action END,
      resource_ref, chain_id, payer, execution_status, phase, input,
      checkpoint, pid, error, created_at, updated_at
    FROM operations;
  DROP TABLE operations;
  ALTER TABLE operations_next RENAME TO operations;
  CREATE INDEX operations_scope ON operations (chain_id, payer, updated_at);
  CREATE INDEX operations_status ON operations (execution_status, updated_at);
  `,
]

/**
 * Resolve the CLI state directory: `FOC_STATE_DIR`, or the platform
 * application data directory.
 */
export function stateDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.FOC_STATE_DIR ?? envPaths('foc', { suffix: '' }).data
}

/**
 * Open (and migrate) the SQLite state database in `dir`.
 *
 * @see https://nodejs.org/api/sqlite.html
 */
export function openDatabase(dir: string): DatabaseSync {
  mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(join(dir, 'state.db'))
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  migrate(db)
  return db
}

/** Apply pending migrations inside a transaction. */
export function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as {
    user_version: number
  }
  const current = row.user_version
  for (let version = current; version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version])
      db.exec(`PRAGMA user_version = ${version + 1}`)
    })
  }
}

/** Run `fn` in a SQLite transaction, rolling back when it throws. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
