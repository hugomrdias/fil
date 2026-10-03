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

/** Variables for {@link useDeletePieces}. */
export interface UseDeletePiecesVariables {
  /** Data set holding the pieces. */
  dataSet: PdpDataSet
  /** Piece ids to schedule for removal. */
  pieceIds: bigint[]
}

/** Props for {@link useDeletePieces}. */
export interface UseDeletePiecesProps extends SessionKeySignerOptions {
  /** Called with the provider's transaction hash. */
  onHash?: (hash: string) => void
  /** Mutation options. */
  mutation?: Omit<
    MutateOptions<
      SP.schedulePieceDeletions.OutputType,
      Error,
      UseDeletePiecesVariables
    >,
    'mutationFn'
  >
}

/**
 * Schedule a batch of pieces for removal in one signed request.
 *
 * @param props - {@link UseDeletePiecesProps}
 */
export function useDeletePieces(props?: UseDeletePiecesProps) {
  const config = useConfig()
  const chainId = useChainId({ config })
  const connection = useConnection({ config })
  const queryClient = useQueryClient()

  return useMutation({
    ...props?.mutation,
    mutationFn: async ({ dataSet, pieceIds }: UseDeletePiecesVariables) => {
      if (!dataSet.provider) {
        throw new Error(`Provider ${dataSet.providerId} is unavailable`)
      }
      const client = await getSignerClient(config, {
        account: connection.address,
        chainId,
        sessionKey: props?.sessionKey,
      })
      const result = await SP.schedulePieceDeletions(client, {
        serviceURL: dataSet.provider.pdp.serviceURL,
        dataSetId: dataSet.dataSetId,
        clientDataSetId: dataSet.clientDataSetId,
        pieceIds,
      })
      props?.onHash?.(result.hash)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: synapseKeys.dataSets }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.pdpDataSets }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.pdpDataSet }),
      ])
      return result
    },
  })
}
