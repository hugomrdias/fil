import { getChain } from '@filoz/synapse-core/chains'
import { getAccountSummary } from '@filoz/synapse-core/pay'
import {
  skipToken,
  type UseQueryOptions,
  useQuery,
} from '@tanstack/react-query'
import type { Address } from 'viem'
import { useChainId, useConfig } from 'wagmi'
import { synapseKeys } from './keys'

/** Props for {@link useAccountSummary}. */
export interface UseAccountSummaryProps {
  /** Payer address. */
  address?: Address
  /** Token; defaults to USDFC. */
  token?: Address
  /** Chain id; defaults to the connected chain. */
  chainId?: number
  /** Query options. */
  query?: Omit<
    UseQueryOptions<getAccountSummary.OutputType>,
    'queryKey' | 'queryFn'
  >
}

/**
 * Filecoin Pay account summary: funds, lockups, debt and runway.
 *
 * @param props - {@link UseAccountSummaryProps}
 */
export function useAccountSummary(props: UseAccountSummaryProps) {
  const config = useConfig()
  const connectedChainId = useChainId({ config })
  const chainId = props.chainId ?? connectedChainId
  const token = props.token ?? getChain(chainId).contracts.usdfc.address
  const address = props.address
  return useQuery({
    refetchInterval: 30_000,
    ...props.query,
    queryKey: [...synapseKeys.accountSummary, chainId, address, token],
    queryFn: address
      ? () =>
          getAccountSummary(config.getClient({ chainId }), { address, token })
      : skipToken,
  })
}
