import { z } from 'incur'
import { Conf } from 'iso-conf'

/** Networks the CLI can target. */
export const NetworkSchema = z.enum(['mainnet', 'calibration'])

/** A supported network name. */
export type Network = z.infer<typeof NetworkSchema>

/**
 * A session key saved by `foc login`. `rootAddress` is absent while the
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
  network: NetworkSchema.default('calibration'),
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
 * Open the configuration file. `FOC_CONFIG_DIR` overrides the platform
 * config directory. The file is written with mode 0600.
 *
 * @see https://github.com/hugomrdias/iso-repo/tree/main/packages/iso-conf
 */
export function openConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return new Conf({
    projectName: 'foc',
    projectSuffix: '',
    cwd: env.FOC_CONFIG_DIR,
    schema: ConfigSchema,
  })
}

/**
 * Resolve the network: flag, then `FOC_NETWORK`, then the config file, then
 * calibration.
 */
export function resolveNetwork(
  flag: string | undefined,
  env: NodeJS.ProcessEnv,
  config: Pick<Config, 'get'>
): Network {
  const value = flag ?? env.FOC_NETWORK ?? config.get('network')
  return NetworkSchema.parse(value ?? 'calibration')
}
