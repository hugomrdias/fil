import { setOperatorApprovalSync } from '@filoz/synapse-core/pay'
import {
  type MutateOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useChainId, useConfig, useConnection } from 'wagmi'
import { synapseKeys } from './keys'
import { getSignerClient } from './utils'

/** Variables for {@link useSetOperatorApproval}. */
export type UseSetOperatorApprovalVariables = Omit<
  setOperatorApprovalSync.OptionsType,
  'onHash' | 'contractAddress'
>

/** Props for {@link useSetOperatorApproval}. */
export interface UseSetOperatorApprovalProps {
  /** Called with the transaction hash before waiting for the receipt. */
  onHash?: (hash: string) => void
  /** Mutation options. */
  mutation?: Omit<
    MutateOptions<
      setOperatorApprovalSync.OutputType,
      Error,
      UseSetOperatorApprovalVariables
    >,
    'mutationFn'
  >
}

/**
 * Approve or revoke a Filecoin Pay operator (FWSS by default) with explicit
 * rate, lockup and max lockup period allowances.
 *
 * @param props - {@link UseSetOperatorApprovalProps}
 */
export function useSetOperatorApproval(props?: UseSetOperatorApprovalProps) {
  const config = useConfig()
  const chainId = useChainId({ config })
  const connection = useConnection({ config })
  const queryClient = useQueryClient()

  return useMutation({
    ...props?.mutation,
    mutationFn: async (variables: UseSetOperatorApprovalVariables) => {
      const client = await getSignerClient(config, {
        account: connection.address,
        chainId,
      })
      const result = await setOperatorApprovalSync(client, {
        ...variables,
        onHash: props?.onHash,
      })
      // Upload costs report whether FWSS still needs approval.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: synapseKeys.operatorApprovals,
        }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.uploadCosts }),
      ])
      return result
    },
  })
}
