import { getRail } from '@filoz/synapse-core/pay'
import {
  skipToken,
  type UseQueryOptions,
  useQuery,
} from '@tanstack/react-query'
import { useChainId, useConfig } from 'wagmi'
import { synapseKeys } from './keys'

/** Props for {@link useRail}. */
export interface UseRailProps {
  /** Rail id. */
  railId?: bigint
  /** Chain id; defaults to the connected chain. */
  chainId?: number
  /** Query options. */
  query?: Omit<UseQueryOptions<getRail.OutputType>, 'queryKey' | 'queryFn'>
}

/**
 * Live on-chain rail state from Filecoin Pay.
 *
 * @param props - {@link UseRailProps}
 */
export function useRail(props: UseRailProps) {
  const config = useConfig()
  const connectedChainId = useChainId({ config })
  const chainId = props.chainId ?? connectedChainId
  const railId = props.railId
  return useQuery({
    ...props.query,
    queryKey: [...synapseKeys.rail, chainId, railId?.toString()],
    queryFn:
      railId === undefined
        ? skipToken
        : () => getRail(config.getClient({ chainId }), { railId }),
  })
}
