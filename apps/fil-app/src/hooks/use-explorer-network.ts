import { useParams } from '@tanstack/react-router'
import { useChainId } from 'wagmi'
import {
  DEFAULT_NETWORK,
  isNetwork,
  type Network,
  networkForChainId,
} from '@/lib/networks'

/**
 * Network for explorer links: the `$network` path param when present,
 * otherwise the wallet's network, otherwise mainnet.
 */
export function useExplorerNetwork(): Network {
  const params = useParams({ strict: false }) as { network?: string }
  const chainId = useChainId()
  if (isNetwork(params.network)) {
    return params.network
  }
  return networkForChainId(chainId) ?? DEFAULT_NETWORK
}
