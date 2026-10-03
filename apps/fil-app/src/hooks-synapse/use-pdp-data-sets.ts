import { paginate } from '@filoz/synapse-core'
import {
  getPdpDataSet,
  getPdpDataSets,
  type PdpDataSet,
} from '@filoz/synapse-core/warm-storage'
import {
  skipToken,
  type UseQueryOptions,
  useQuery,
} from '@tanstack/react-query'
import type { Address } from 'viem'
import { useChainId, useConfig } from 'wagmi'
import { synapseKeys } from './keys'

/** Props for {@link usePdpDataSets}. */
export interface UsePdpDataSetsProps {
  /** Client (payer) address. */
  address?: Address
  /** Chain id; defaults to the connected chain. */
  chainId?: number
  /** Query options (honoured, unlike synapse-react `useDataSets`). */
  query?: Omit<UseQueryOptions<PdpDataSet[]>, 'queryKey' | 'queryFn'>
}

/**
 * All Warm Storage data sets of a client with live status, CDN flag,
 * metadata and provider, without loading every piece.
 *
 * @param props - {@link UsePdpDataSetsProps}
 */
export function usePdpDataSets(props: UsePdpDataSetsProps) {
  const config = useConfig()
  const connectedChainId = useChainId({ config })
  const chainId = props.chainId ?? connectedChainId
  const address = props.address
  return useQuery({
    // Paging every data set is costly; writes invalidate this key.
    staleTime: 60_000,
    ...props.query,
    queryKey: [...synapseKeys.pdpDataSets, chainId, address],
    queryFn: address
      ? async () => {
          const client = config.getClient({ chainId })
          const items: PdpDataSet[] = []
          for await (const dataSet of paginate((page) =>
            getPdpDataSets(client, { address, ...page })
          )) {
            items.push(dataSet)
          }
          return items
        }
      : skipToken,
  })
}

/** Props for {@link usePdpDataSet}. */
export interface UsePdpDataSetProps {
  /** Data set id. */
  dataSetId?: bigint
  /** Chain id; defaults to the connected chain. */
  chainId?: number
  /** Query options. */
  query?: Omit<UseQueryOptions<PdpDataSet | null>, 'queryKey' | 'queryFn'>
}

/**
 * A single Warm Storage data set with rails, provider and metadata.
 *
 * @param props - {@link UsePdpDataSetProps}
 */
export function usePdpDataSet(props: UsePdpDataSetProps) {
  const config = useConfig()
  const connectedChainId = useChainId({ config })
  const chainId = props.chainId ?? connectedChainId
  const dataSetId = props.dataSetId
  return useQuery({
    ...props.query,
    queryKey: [...synapseKeys.pdpDataSet, chainId, dataSetId?.toString()],
    queryFn:
      dataSetId === undefined
        ? skipToken
        : () => getPdpDataSet(config.getClient({ chainId }), { dataSetId }),
  })
}
