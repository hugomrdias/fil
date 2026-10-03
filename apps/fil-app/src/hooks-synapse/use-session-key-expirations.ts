import { getExpirations } from '@filoz/synapse-core/session-key'
import {
  skipToken,
  type UseQueryOptions,
  useQuery,
} from '@tanstack/react-query'
import type { Address } from 'viem'
import { useChainId, useConfig } from 'wagmi'
import { synapseKeys } from './keys'

/** Props for {@link useSessionKeyExpirations}. */
export interface UseSessionKeyExpirationsProps {
  /** Root wallet address. */
  address?: Address
  /** Session key address. */
  sessionKeyAddress?: Address
  /** Permissions to read; defaults to all FWSS permissions. */
  permissions?: getExpirations.OptionsType['permissions']
  /** Chain id; defaults to the connected chain. */
  chainId?: number
  /** Query options. */
  query?: Omit<
    UseQueryOptions<getExpirations.OutputType>,
    'queryKey' | 'queryFn'
  >
}

/**
 * Read per-permission expiries of a session key from the SessionKeyRegistry.
 *
 * @param props - {@link UseSessionKeyExpirationsProps}
 */
export function useSessionKeyExpirations(props: UseSessionKeyExpirationsProps) {
  const config = useConfig()
  const connectedChainId = useChainId({ config })
  const chainId = props.chainId ?? connectedChainId
  const { address, sessionKeyAddress, permissions } = props
  return useQuery({
    ...props.query,
    queryKey: [
      ...synapseKeys.sessionKeyExpirations,
      chainId,
      address,
      sessionKeyAddress,
      permissions,
    ],
    queryFn:
      address && sessionKeyAddress
        ? () =>
            getExpirations(config.getClient({ chainId }), {
              address,
              sessionKeyAddress,
              permissions,
            })
        : skipToken,
  })
}
