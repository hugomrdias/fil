import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import {
  calibration,
  type FilecoinChain,
  mainnet,
} from '@filoz/synapse-core/chains'
import { getTransport } from '@filoz/synapse-core/client'
import { type Client, createPublicClient, http, type Transport } from 'viem'
import {
  type Config,
  type Network,
  openConfig,
  resolveNetwork,
} from './config.ts'
import { openDatabase, stateDir } from './state/db.ts'

/** Default pay.filecoin.cloud console origin. */
export const DEFAULT_CONSOLE_URL = 'https://pay.filecoin.cloud'

/**
 * Shared per-invocation context: resolved network, chain client, config, and
 * lazily opened local state.
 */
export type App = {
  network: Network
  chain: FilecoinChain
  env: NodeJS.ProcessEnv
  config: Config
  /** Console origin for session-key approval and funding links. */
  consoleUrl: string
  /** RPC transport for the resolved chain. */
  transport: Transport
  /** Read-only chain client. */
  client: Client<Transport, FilecoinChain>
  /** Open the state database on first use. */
  db: () => DatabaseSync
  /** Staging directory for an operation's prepared input. */
  stagingDir: (operationId: string) => string
}

/** Options for {@link createApp}. */
export type CreateAppOptions = {
  /** Value of the global `--network` flag. */
  network?: string
  env?: NodeJS.ProcessEnv
}

/** Map a network name to its synapse-core chain definition. */
export function chainFor(network: Network): FilecoinChain {
  return network === 'mainnet' ? mainnet : calibration
}

/**
 * Build the invocation context. `FOC_RPC_URL` overrides the chain's default
 * fallback transport.
 */
export function createApp(options: CreateAppOptions = {}): App {
  const env = options.env ?? process.env
  const config = openConfig(env)
  const network = resolveNetwork(options.network, env, config)
  const chain = chainFor(network)
  const transport = env.FOC_RPC_URL
    ? http(env.FOC_RPC_URL)
    : getTransport(chain)
  const root = stateDir(env)
  let db: DatabaseSync | undefined
  return {
    network,
    chain,
    env,
    config,
    consoleUrl: env.FOC_CONSOLE_URL ?? DEFAULT_CONSOLE_URL,
    transport,
    client: createPublicClient({ chain, transport }),
    db: () => {
      db ??= openDatabase(root)
      return db
    },
    stagingDir: (operationId) => join(root, 'staging', operationId),
  }
}
