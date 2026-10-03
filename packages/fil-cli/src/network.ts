/** Networks the CLI can target. Kept free of imports so definitions stay light. */
export const NETWORKS = ['mainnet', 'calibration'] as const

/** A supported network name. */
export type Network = (typeof NETWORKS)[number]

/** Network used when neither input, environment, nor config chooses one. */
export const DEFAULT_NETWORK: Network = 'calibration'
