import {
  calibration,
  type FilecoinChain,
  mainnet,
} from '@filoz/synapse-core/chains'

/** Network names served by fil-api and used in explorer URLs. */
export const NETWORKS = ['mainnet', 'calibration'] as const

/** A Filecoin network supported by fil-app. */
export type Network = (typeof NETWORKS)[number]

/** Default network for the explorer. */
export const DEFAULT_NETWORK: Network = 'mainnet'

/** Synapse chain definitions keyed by network name. */
export const CHAINS: Record<Network, FilecoinChain> = {
  mainnet,
  calibration,
}

/** Human-readable network labels. */
export const NETWORK_LABELS: Record<Network, string> = {
  mainnet: 'Mainnet',
  calibration: 'Calibration',
}

/**
 * Check whether a value is a supported network name.
 *
 * @param value - Candidate network name.
 */
export function isNetwork(value: unknown): value is Network {
  return typeof value === 'string' && NETWORKS.includes(value as Network)
}

/**
 * Resolve the network name for a chain id.
 *
 * @param chainId - EVM chain id.
 * @returns The network, or `undefined` for unsupported chains.
 */
export function networkForChainId(chainId: number | undefined) {
  return NETWORKS.find((network) => CHAINS[network].id === chainId)
}

/**
 * Default block explorer base URL for a network (Blockscout).
 *
 * @param network - Filecoin network.
 * @see https://viem.sh/docs/chains/introduction#blockexplorers
 */
function explorerUrl(network: Network) {
  const url = CHAINS[network].blockExplorers?.default.url
  if (!url) {
    throw new Error(`No block explorer configured for ${network}`)
  }
  return url
}

/**
 * Block explorer link to a transaction.
 *
 * @param network - Filecoin network.
 * @param hash - Transaction hash.
 */
export function txUrl(network: Network, hash: string) {
  return `${explorerUrl(network)}/tx/${hash}`
}

/**
 * Block explorer link to an address.
 *
 * @param network - Filecoin network.
 * @param address - 0x address.
 */
export function addressUrl(network: Network, address: string) {
  return `${explorerUrl(network)}/address/${address}`
}

/**
 * Swap the leading network segment of a pathname, keeping the rest.
 *
 * @param pathname - Current pathname, e.g. `/mainnet/rails/5`.
 * @param network - Target network.
 * @returns The new pathname, e.g. `/calibration/rails/5`.
 */
export function switchNetworkPath(pathname: string, network: Network) {
  const [, first, ...rest] = pathname.split('/')
  if (isNetwork(first)) {
    return `/${[network, ...rest].join('/')}`
  }
  return `/${network}`
}
