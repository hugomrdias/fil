import {
  settleRailSync,
  settleTerminatedRailWithoutValidationSync,
} from '@filoz/synapse-core/pay'
import {
  type MutateOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useChainId, useConfig, useConnection } from 'wagmi'
import { synapseKeys } from './keys'
import { getSignerClient } from './utils'

/** Variables for {@link useSettleRail}. */
export interface UseSettleRailVariables {
  /** Rail id. */
  railId: bigint
  /** Settle up to this epoch; defaults to the current epoch. */
  untilEpoch?: bigint
}

/** Props for {@link useSettleRail}. */
export interface UseSettleRailProps {
  /** Called with the transaction hash before waiting for the receipt. */
  onHash?: (hash: string) => void
  /** Mutation options. */
  mutation?: Omit<
    MutateOptions<settleRailSync.OutputType, Error, UseSettleRailVariables>,
    'mutationFn'
  >
}

/**
 * Settle a Filecoin Pay rail up to an epoch.
 *
 * @param props - {@link UseSettleRailProps}
 */
export function useSettleRail(props?: UseSettleRailProps) {
  const config = useConfig()
  const chainId = useChainId({ config })
  const connection = useConnection({ config })
  const queryClient = useQueryClient()

  return useMutation({
    ...props?.mutation,
    mutationFn: async (variables: UseSettleRailVariables) => {
      const client = await getSignerClient(config, {
        account: connection.address,
        chainId,
      })
      const result = await settleRailSync(client, {
        ...variables,
        onHash: props?.onHash,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: synapseKeys.rail }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.accountInfo }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.accountSummary }),
      ])
      return result
    },
  })
}

/** Variables for {@link useSettleTerminatedRail}. */
export interface UseSettleTerminatedRailVariables {
  /** Terminated rail id. */
  railId: bigint
}

/** Props for {@link useSettleTerminatedRail}. */
export interface UseSettleTerminatedRailProps {
  /** Called with the transaction hash before waiting for the receipt. */
  onHash?: (hash: string) => void
  /** Mutation options. */
  mutation?: Omit<
    MutateOptions<
      settleTerminatedRailWithoutValidationSync.OutputType,
      Error,
      UseSettleTerminatedRailVariables
    >,
    'mutationFn'
  >
}

/**
 * Settle a terminated rail without validation (payer escape hatch after the
 * validator stops responding).
 *
 * @param props - {@link UseSettleTerminatedRailProps}
 */
export function useSettleTerminatedRail(props?: UseSettleTerminatedRailProps) {
  const config = useConfig()
  const chainId = useChainId({ config })
  const connection = useConnection({ config })
  const queryClient = useQueryClient()

  return useMutation({
    ...props?.mutation,
    mutationFn: async ({ railId }: UseSettleTerminatedRailVariables) => {
      const client = await getSignerClient(config, {
        account: connection.address,
        chainId,
      })
      const result = await settleTerminatedRailWithoutValidationSync(client, {
        railId,
        onHash: props?.onHash,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: synapseKeys.rail }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.accountInfo }),
        queryClient.invalidateQueries({ queryKey: synapseKeys.accountSummary }),
      ])
      return result
    },
  })
}
