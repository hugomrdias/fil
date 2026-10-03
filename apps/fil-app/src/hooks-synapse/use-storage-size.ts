import { getAccountTotalStorageSize } from '@filoz/synapse-core/warm-storage'
import {
  skipToken,
  type UseQueryOptions,
  useQuery,
} from '@tanstack/react-query'
import type { Address } from 'viem'
import { useChainId, useConfig } from 'wagmi'
import { synapseKeys } from './keys'

/** Props for {@link useStorageSize}. */
export interface UseStorageSizeProps {
  /** Client address. */
  address?: Address
  /** Chain id; defaults to the connected chain. */
  chainId?: number
  /** Query options. */
  query?: Omit<
    UseQueryOptions<getAccountTotalStorageSize.OutputType>,
    'queryKey' | 'queryFn'
  >
}

/**
 * Total bytes stored and live data set count for a client.
 *
 * @param props - {@link UseStorageSizeProps}
 */
export function useStorageSize(props: UseStorageSizeProps) {
  const config = useConfig()
  const connectedChainId = useChainId({ config })
  const chainId = props.chainId ?? connectedChainId
  const address = props.address
  return useQuery({
    ...props.query,
    queryKey: [...synapseKeys.storageSize, chainId, address],
    queryFn: address
      ? () =>
          getAccountTotalStorageSize(config.getClient({ chainId }), { address })
      : skipToken,
  })
}
