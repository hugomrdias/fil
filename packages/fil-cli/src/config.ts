import { Conf } from 'iso-conf'
import * as z from 'zod'
import { DEFAULT_NETWORK, NETWORKS, type Network } from './network.ts'

/** Networks the CLI can target. */
export const NetworkSchema = z.enum(NETWORKS)

export type { Network } from './network.ts'

/**
 * A session key saved by `fil login`. `rootAddress` is absent while the
 * login is pending approval in the console.
 */
export const SessionSchema = z.object({
  privateKey: z.string(),
  address: z.string(),
  rootAddress: z.string().optional(),
  scopes: z.array(z.string()),
  /** Block height when the key was created, used to scan for its approval. */
  fromBlock: z.string(),
  /** Earliest expiry among the granted scopes, in Unix seconds. */
  expiresAt: z.string().optional(),
  createdAt: z.string(),
})

/** A saved session. */
export type StoredSession = z.infer<typeof SessionSchema>

/** Persisted CLI configuration. */
export const ConfigSchema = z.object({
  /** Default network; `resolveNetwork` falls back to calibration. */
  network: NetworkSchema.optional(),
  sessions: z
    .object({
      mainnet: SessionSchema.optional(),
      calibration: SessionSchema.optional(),
    })
    .default({}),
})

/** The CLI configuration store. */
export type Config = Conf<typeof ConfigSchema>

/**
 * Open the configuration file. `FIL_CONFIG_DIR` overrides the platform
 * config directory. The file is written with mode 0600.
 *
 * @see https://github.com/hugomrdias/iso-repo/tree/main/packages/iso-conf
 */
export function openConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return new Conf({
    projectName: 'fil',
    projectSuffix: '',
    cwd: env.FIL_CONFIG_DIR,
    schema: ConfigSchema,
  })
}

/**
 * Resolve the network: the command input (a `--network` flag or
 * `FIL_NETWORK`, merged by clipact), then the config file, then calibration.
 */
export function resolveNetwork(
  input: Network | undefined,
  config: Pick<Config, 'get'>
): Network {
  return input ?? config.get('network') ?? DEFAULT_NETWORK
}
