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
  /** Session key and owner given as input (`FOC_SESSION_KEY`, `FOC_ROOT_ADDRESS`). */
  credentials: { sessionKey?: string; rootAddress?: string }
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

/** Options for {@link createApp}: the shared account input of a command. */
export type CreateAppOptions = {
  /** `--network` or `FOC_NETWORK`; falls back to the config file. */
  network?: Network | undefined
  /** `FOC_SESSION_KEY`, for CI without `foc login`. */
  sessionKey?: string | undefined
  /** `FOC_ROOT_ADDRESS`, the wallet that authorized `sessionKey`. */
  rootAddress?: string | undefined
  /** Process environment for state, config, RPC, and console overrides. */
  env?: NodeJS.ProcessEnv
}

/** Map a network name to its synapse-core chain definition. */
export function chainFor(network: Network): FilecoinChain {
  return network === 'mainnet' ? mainnet : calibration
}

/**
 * Build the invocation context from a command's account input. Handlers call
 * this directly; clipact has no middleware. `FOC_RPC_URL` overrides the
 * chain's default fallback transport.
 */
export function createApp(options: CreateAppOptions = {}): App {
  const env = options.env ?? process.env
  const config = openConfig(env)
  const network = resolveNetwork(options.network, config)
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
    credentials: {
      ...(options.sessionKey ? { sessionKey: options.sessionKey } : {}),
      ...(options.rootAddress ? { rootAddress: options.rootAddress } : {}),
    },
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
