import * as SP from '@filoz/synapse-core/sp'
import type { PdpDataSet } from '@filoz/synapse-core/warm-storage'
import {
  type MutateOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useChainId, useConfig, useConnection } from 'wagmi'
import { synapseKeys } from './keys'
import { getSignerClient, type SessionKeySignerOptions } from './utils'

/** Variables for {@link useTerminateDataSet}. */
export interface UseTerminateDataSetVariables {
  /** Data set to terminate; its provider must be reachable. */
  dataSet: PdpDataSet
}

/** Props for {@link useTerminateDataSet}. */
export interface UseTerminateDataSetProps extends SessionKeySignerOptions {
  /** Called with the provider's termination transaction hash. */
  onHash?: (hash: string) => void
  /** Mutation options. */
  mutation?: Omit<
    MutateOptions<
      SP.waitForTerminateService.OutputType,
      Error,
      UseTerminateDataSetVariables
    >,
    'mutationFn'
  >
}

/**
 * Terminate a data set's storage service through its provider. Payment
 * rails end at the PDP end epoch.
 *
 * @param props - {@link UseTerminateDataSetProps}
 */
export function useTerminateDataSet(props?: UseTerminateDataSetProps) {
  const config = useConfig()
  const chainId = useChainId({ config })
  const connection = useConnection({ config })
  const queryClient = useQueryClient()

  return useMutation({
    ...props?.mutation,
    mutationFn: async ({ dataSet }: UseTerminateDataSetVariables) => {
      if (!dataSet.provider) {
        throw new Error(
          `Provider ${dataSet.providerId} is unavailable for data set ${dataSet.dataSetId}`
        )
      }
      const client = await getSignerClient(config, {
        account: connection.address,
        chainId,
        sessionKey: props?.sessionKey,
      })
      const { statusUrl } = await SP.terminateService(client, {
        serviceURL: dataSet.provider.pdp.serviceURL,
        dataSetId: dataSet.dataSetId,
      })
      const result = await SP.waitForTerminateService({
        statusUrl,
        onHash: props?.onHash,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: synapseKeys.pdpDataSets }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.pdpDataSet }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.dataSets }),
      ])
      return result
    },
  })
}
