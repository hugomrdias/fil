import { depositWithPermitSync } from '@filoz/synapse-core/pay'
import {
  type MutateOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { Address } from 'viem'
import { useChainId, useConfig, useConnection } from 'wagmi'
import { synapseKeys } from './keys'
import { getSignerClient } from './utils'

/** Variables for {@link useDepositWithPermit}. */
export interface UseDepositWithPermitVariables {
  /** Amount in token base units. */
  amount: bigint
}

/** Props for {@link useDepositWithPermit}. */
export interface UseDepositWithPermitProps {
  /** Token; defaults to USDFC. */
  token?: Address
  /** Called with the transaction hash before waiting for the receipt. */
  onHash?: (hash: string) => void
  /** Mutation options. */
  mutation?: Omit<
    MutateOptions<
      depositWithPermitSync.OutputType,
      Error,
      UseDepositWithPermitVariables
    >,
    'mutationFn'
  >
}

/**
 * Deposit into Filecoin Pay with an ERC-2612 permit, so no separate approve
 * transaction is needed.
 *
 * @param props - {@link UseDepositWithPermitProps}
 */
export function useDepositWithPermit(props?: UseDepositWithPermitProps) {
  const config = useConfig()
  const chainId = useChainId({ config })
  const connection = useConnection({ config })
  const queryClient = useQueryClient()

  return useMutation({
    ...props?.mutation,
    mutationFn: async ({ amount }: UseDepositWithPermitVariables) => {
      const client = await getSignerClient(config, {
        account: connection.address,
        chainId,
      })
      const result = await depositWithPermitSync(client, {
        amount,
        token: props?.token,
        onHash: props?.onHash,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: synapseKeys.accountInfo }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.erc20Balance }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.accountSummary }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.uploadCosts }),
      ])
      return result
    },
  })
}
