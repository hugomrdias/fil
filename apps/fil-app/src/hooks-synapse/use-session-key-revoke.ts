import { revokeSync } from '@filoz/synapse-core/session-key'
import {
  type MutateOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useChainId, useConfig, useConnection } from 'wagmi'
import { synapseKeys } from './keys'
import { getSignerClient } from './utils'

/** Variables for {@link useSessionKeyRevoke}. */
export type UseSessionKeyRevokeVariables = Omit<
  revokeSync.OptionsType,
  'onHash' | 'contractAddress'
>

/** Props for {@link useSessionKeyRevoke}. */
export interface UseSessionKeyRevokeProps {
  /** Called with the transaction hash before waiting for the receipt. */
  onHash?: (hash: string) => void
  /** Mutation options. */
  mutation?: Omit<
    MutateOptions<revokeSync.OutputType, Error, UseSessionKeyRevokeVariables>,
    'mutationFn'
  >
}

/**
 * Revoke session key permissions from the connected wallet.
 *
 * @param props - {@link UseSessionKeyRevokeProps}
 */
export function useSessionKeyRevoke(props?: UseSessionKeyRevokeProps) {
  const config = useConfig()
  const chainId = useChainId({ config })
  const connection = useConnection({ config })
  const queryClient = useQueryClient()

  return useMutation({
    ...props?.mutation,
    mutationFn: async (variables: UseSessionKeyRevokeVariables) => {
      const client = await getSignerClient(config, {
        account: connection.address,
        chainId,
      })
      const result = await revokeSync(client, {
        ...variables,
        onHash: props?.onHash,
      })
      await queryClient.invalidateQueries({
        queryKey: synapseKeys.sessionKeyExpirations,
      })
      return result
    },
  })
}
