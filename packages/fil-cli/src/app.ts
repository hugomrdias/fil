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
import { abortable } from './errors.ts'
import { openDatabase, stateDir } from './state/db.ts'

/** Default pay.filecoin.cloud console origin. */
const DEFAULT_CONSOLE_URL = 'https://pay.filecoin.cloud'

/**
 * Shared per-invocation context: resolved network, chain client, config, and
 * lazily opened local state.
 */
export type App = {
  network: Network
  chain: FilecoinChain
  env: NodeJS.ProcessEnv
  config: Config
  /** Session key and owner given as input (`FIL_SESSION_KEY`, `FIL_ROOT_ADDRESS`). */
  credentials: { sessionKey?: string; rootAddress?: string }
  /** Console origin for session-key approval and funding links. */
  consoleUrl: string
  /** Aborted on SIGINT, SIGTERM, or SIGHUP; cancels chain and provider calls. */
  signal: AbortSignal | undefined
  /** RPC transport for the resolved chain, bound to `signal`. */
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
  /** `--network` or `FIL_NETWORK`; falls back to the config file. */
  network?: Network | undefined
  /** `FIL_SESSION_KEY`, for CI without `fil login`. */
  sessionKey?: string | undefined
  /** `FIL_ROOT_ADDRESS`, the wallet that authorized `sessionKey`. */
  rootAddress?: string | undefined
  /** Process environment for state, config, RPC, and console overrides. */
  env?: NodeJS.ProcessEnv
  /** The handler's signal; every RPC request rejects once it aborts. */
  signal?: AbortSignal
}

/**
 * Bind `transport` to `signal`: a request rejects as soon as the signal
 * aborts, and none starts after it. synapse-core and viem read actions take
 * no signal of their own. The signal is not passed down: viem's http
 * transport would use it in place of its own timeout, so requests would no
 * longer time out, and the fallback transport drops it anyway.
 */
export function withSignal(
  transport: Transport,
  signal: AbortSignal
): Transport {
  return (options) => {
    const inner = transport(options)
    return {
      ...inner,
      request: (args, requestOptions) =>
        signal.aborted
          ? Promise.reject(signal.reason)
          : abortable(inner.request(args, requestOptions), signal),
    }
  }
}

/**
 * Build the invocation context from a command's account input. Handlers call
 * this directly; clipact has no middleware. `FIL_RPC_URL` overrides the
 * chain's default fallback transport.
 */
export function createApp(options: CreateAppOptions = {}): App {
  const env = options.env ?? process.env
  const config = openConfig(env)
  const network = resolveNetwork(options.network, config)
  const chain = network === 'mainnet' ? mainnet : calibration
  const base = env.FIL_RPC_URL ? http(env.FIL_RPC_URL) : getTransport(chain)
  const transport = options.signal ? withSignal(base, options.signal) : base
  const root = stateDir(env)
  let db: DatabaseSync | undefined
  return {
    network,
    chain,
    env,
    config,
    credentials: {
      sessionKey: options.sessionKey,
      rootAddress: options.rootAddress,
    },
    consoleUrl: env.FIL_CONSOLE_URL ?? DEFAULT_CONSOLE_URL,
    signal: options.signal,
    transport,
    client: createPublicClient({ chain, transport }),
    db: () => {
      db ??= openDatabase(root)
      return db
    },
    stagingDir: (operationId) => join(root, 'staging', operationId),
  }
}
