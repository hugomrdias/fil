import { getUploadCosts } from '@filoz/synapse-core/warm-storage'
import {
  skipToken,
  type UseQueryOptions,
  useQuery,
} from '@tanstack/react-query'
import { useChainId, useConfig } from 'wagmi'
import { synapseKeys } from './keys'

/** Props for {@link useUploadCosts}. */
export interface UseUploadCostsProps
  extends Partial<Omit<getUploadCosts.OptionsType, 'pieceSizes'>> {
  /** Sizes in bytes of the pieces to upload. */
  pieceSizes?: readonly bigint[]
  /** Chain id; defaults to the connected chain. */
  chainId?: number
  /** Query options. */
  query?: Omit<
    UseQueryOptions<getUploadCosts.OutputType>,
    'queryKey' | 'queryFn'
  >
}

/**
 * Rates, fees, lockups and deposit needed for an upload.
 *
 * @param props - {@link UseUploadCostsProps}
 */
export function useUploadCosts(props: UseUploadCostsProps) {
  const config = useConfig()
  const connectedChainId = useChainId({ config })
  const {
    chainId: chainIdProp,
    query,
    pieceSizes,
    clientAddress,
    ...rest
  } = props
  const chainId = chainIdProp ?? connectedChainId
  return useQuery({
    ...query,
    queryKey: [
      ...synapseKeys.uploadCosts,
      chainId,
      clientAddress,
      pieceSizes?.map(String),
      Object.fromEntries(
        Object.entries(rest).map(([key, value]) => [key, String(value)])
      ),
    ],
    queryFn:
      clientAddress && pieceSizes && pieceSizes.length > 0
        ? () =>
            getUploadCosts(config.getClient({ chainId }), {
              ...rest,
              clientAddress,
              pieceSizes,
            })
        : skipToken,
  })
}
