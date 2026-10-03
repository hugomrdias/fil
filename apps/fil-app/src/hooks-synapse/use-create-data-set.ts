import * as SP from '@filoz/synapse-core/sp'
import type { PDPProvider } from '@filoz/synapse-core/sp-registry'
import type { MetadataObject } from '@filoz/synapse-core/warm-storage'
import {
  type MutateOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useChainId, useConfig, useConnection } from 'wagmi'
import { synapseKeys } from './keys'
import { getSignerClient, type SessionKeySignerOptions } from './utils'

/** Variables for {@link useCreateDataSet}. */
export interface UseCreateDataSetVariables {
  /** Provider that will store the data set. */
  provider: PDPProvider
  /** Enable FilBeam CDN retrievals. */
  cdn: boolean
  /** Data set metadata key/values. */
  metadata?: MetadataObject
}

/** Props for {@link useCreateDataSet}. */
export interface UseCreateDataSetProps extends SessionKeySignerOptions {
  /** Called with the provider's transaction hash. */
  onHash?: (hash: string) => void
  /** Mutation options. */
  mutation?: Omit<
    MutateOptions<
      SP.waitForCreateDataSet.ReturnType,
      Error,
      UseCreateDataSetVariables
    >,
    'mutationFn'
  >
}

/**
 * Create a Warm Storage data set through a provider, with metadata and
 * optional session key signing.
 *
 * @param props - {@link UseCreateDataSetProps}
 */
export function useCreateDataSet(props?: UseCreateDataSetProps) {
  const config = useConfig()
  const chainId = useChainId({ config })
  const connection = useConnection({ config })
  const queryClient = useQueryClient()

  return useMutation({
    ...props?.mutation,
    mutationFn: async ({
      provider,
      cdn,
      metadata,
    }: UseCreateDataSetVariables) => {
      const client = await getSignerClient(config, {
        account: connection.address,
        chainId,
        sessionKey: props?.sessionKey,
      })
      const { txHash, statusUrl } = await SP.createDataSet(client, {
        payee: provider.payee,
        payer: connection.address,
        serviceURL: provider.pdp.serviceURL,
        cdn,
        metadata,
      })
      props?.onHash?.(txHash)
      const dataSet = await SP.waitForCreateDataSet({ statusUrl })
      // New rails lock funds and use FWSS allowances.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: synapseKeys.dataSets }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.pdpDataSets }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.storageSize }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.accountInfo }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.accountSummary }),
        queryClient.invalidateQueries({
          queryKey: synapseKeys.operatorApprovals,
        }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.uploadCosts }),
      ])
      return dataSet
    },
  })
}
