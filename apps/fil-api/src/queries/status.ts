import type { Db } from '../db.ts'
import type { Network } from '../networks.ts'
import type { Status } from '../schemas/resources.ts'
import { ident, join, sql } from '../sql.ts'

/** A `_ponder_checkpoint` row tagged with its schema. */
interface CheckpointRow {
  schema: string
  chain_name: string
  chain_id: string
  latest_checkpoint: string
  safe_checkpoint: string
  finalized_checkpoint: string
}

/** Block position decoded from a Ponder checkpoint. */
export interface Checkpoint {
  blockNumber: number
  timestamp: number
}

/**
 * Decode a Ponder checkpoint string: a 10-digit block timestamp, a 16-digit
 * chain id, then a 16-digit block number, followed by in-block position.
 *
 * @see https://github.com/ponder-sh/ponder/blob/main/packages/core/src/utils/checkpoint.ts
 */
export function parseCheckpoint(value: unknown): Checkpoint | null {
  if (typeof value !== 'string' || value.length < 42) return null
  const timestamp = Number(value.slice(0, 10))
  const blockNumber = Number(value.slice(26, 42))
  if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(blockNumber)) {
    return null
  }
  return { blockNumber, timestamp }
}

/** Indexer progress for every schema of a network. */
export async function getStatus(db: Db, network: Network): Promise<Status> {
  const rows = await db.query<CheckpointRow>(
    join(
      Object.values(network.schemas).map(
        (schema) =>
          sql`select ${schema}::text as schema, chain_name, chain_id,
             latest_checkpoint, safe_checkpoint, finalized_checkpoint
           from ${ident(schema)}._ponder_checkpoint`
      ),
      ' union all '
    )
  )
  return {
    network: network.name,
    chainId: network.chainId,
    indexers: rows.map((r) => ({
      schema: r.schema,
      chainName: r.chain_name,
      chainId: Number(r.chain_id),
      latest: parseCheckpoint(r.latest_checkpoint),
      safe: parseCheckpoint(r.safe_checkpoint),
      finalized: parseCheckpoint(r.finalized_checkpoint),
    })),
  }
}
