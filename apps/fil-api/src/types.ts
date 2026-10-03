import type { Db, DbStats } from './db.ts'
import type { Bindings, Network } from './networks.ts'

/** Hono environment for the app. */
export interface AppEnv {
  Bindings: Bindings
  Variables: {
    requestId: string
    dbStats: DbStats
    db: Db
    network: Network
  }
}
