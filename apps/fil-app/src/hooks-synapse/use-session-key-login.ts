import { loginSync } from '@filoz/synapse-core/session-key'
import {
  type MutateOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useChainId, useConfig, useConnection } from 'wagmi'
import { synapseKeys } from './keys'
import { getSignerClient } from './utils'

/** Variables for {@link useSessionKeyLogin}. */
export type UseSessionKeyLoginVariables = Omit<
  loginSync.OptionsType,
  'onHash' | 'contractAddress'
>

/** Props for {@link useSessionKeyLogin}. */
export interface UseSessionKeyLoginProps {
  /** Called with the transaction hash before waiting for the receipt. */
  onHash?: (hash: string) => void
  /** Mutation options. */
  mutation?: Omit<
    MutateOptions<loginSync.OutputType, Error, UseSessionKeyLoginVariables>,
    'mutationFn'
  >
}

/**
 * Authorize a session key for FWSS permissions from the connected wallet.
 *
 * @param props - {@link UseSessionKeyLoginProps}
 */
export function useSessionKeyLogin(props?: UseSessionKeyLoginProps) {
  const config = useConfig()
  const chainId = useChainId({ config })
  const connection = useConnection({ config })
  const queryClient = useQueryClient()

  return useMutation({
    ...props?.mutation,
    mutationFn: async (variables: UseSessionKeyLoginVariables) => {
      const client = await getSignerClient(config, {
        account: connection.address,
        chainId,
      })
      const result = await loginSync(client, {
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
