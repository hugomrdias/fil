import postgres from 'postgres'

/** A database row keyed by column name. */
export type Row = Record<string, unknown>

/** Minimal read-only query interface used by the query layer. */
export interface Db {
  /** Run a parameterized SQL query and return its rows. */
  query<T extends Row = Row>(
    text: string,
    params?: readonly unknown[]
  ): Promise<T[]>
  /** Release the underlying connection. */
  close(): Promise<void>
}

/** Creates a {@link Db} from a Hyperdrive binding. */
export type DbFactory = (hyperdrive: Hyperdrive) => Db

/**
 * Create a postgres.js backed {@link Db} for a Hyperdrive connection string.
 *
 * `numeric` and `int8` values stay strings so uint256 amounts keep full
 * precision.
 *
 * @see https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js/
 */
export function createPostgresDb(connectionString: string): Db {
  const sql = postgres(connectionString, {
    max: 5,
    fetch_types: false,
    prepare: true,
  })
  return {
    async query<T extends Row = Row>(
      text: string,
      params: readonly unknown[] = []
    ) {
      const rows = await sql.unsafe(
        text,
        params as postgres.ParameterOrJSON<never>[],
        {
          prepare: true,
        }
      )
      return rows as unknown as T[]
    },
    close: () => sql.end({ timeout: 5 }),
  }
}

/** Default {@link DbFactory} that connects through Hyperdrive. */
export const hyperdriveDb: DbFactory = (hyperdrive) =>
  createPostgresDb(hyperdrive.connectionString)

/** Running totals for database work done while serving one request. */
export interface DbStats {
  queries: number
  ms: number
}

/** Wrap a {@link Db} so every query adds to `stats`. */
export function withStats(db: Db, stats: DbStats): Db {
  return {
    async query(text, params) {
      const start = performance.now()
      try {
        return await db.query(text, params)
      } finally {
        stats.queries++
        stats.ms += performance.now() - start
      }
    },
    close: () => db.close(),
  }
}

/**
 * SQL expression for an event's position in its block. Ponder event ids are
 * `<blockHash>-<logIndex>`, so same-block events order by the numeric suffix,
 * not the id text (where `-9` sorts after `-10`).
 */
export function logIndex(alias?: string): string {
  return `split_part(${alias ? `${alias}.` : ''}id, '-', 2)::int`
}

/** Quote a trusted SQL identifier such as a configured schema name. */
export function ident(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

/**
 * Collects SQL `WHERE` conditions and their positional parameters.
 */
export class Where {
  readonly params: unknown[]
  readonly #conditions: string[] = []

  /** Start a builder, optionally after existing parameters. */
  constructor(params: unknown[] = []) {
    this.params = params
  }

  /** Add a parameter and return its `$n` placeholder. */
  param(value: unknown): string {
    this.params.push(value)
    return `$${this.params.length}`
  }

  /** Add a condition; `build` receives placeholders for `values`. */
  add(build: (...placeholders: string[]) => string, ...values: unknown[]) {
    this.#conditions.push(build(...values.map((v) => this.param(v))))
    return this
  }

  /** Add a condition only when `value` is defined. */
  maybe<T>(value: T | undefined, build: (placeholder: string) => string) {
    if (value !== undefined) this.add(build, value)
    return this
  }

  /** Add a raw condition with no parameters. */
  raw(condition: string) {
    this.#conditions.push(condition)
    return this
  }

  /** Render `<keyword> ...`, or an empty string without conditions. */
  render(keyword: 'where' | 'having' = 'where'): string {
    return this.#conditions.length === 0
      ? ''
      : `${keyword} ${this.#conditions.join(' and ')}`
  }

  /** Render as a `WHERE` clause. */
  toString(): string {
    return this.render()
  }
}
