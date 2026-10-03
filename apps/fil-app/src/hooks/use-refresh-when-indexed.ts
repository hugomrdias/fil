import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useConfig } from 'wagmi'
import { getBlockNumber } from 'wagmi/actions'
import { waitForIndexer } from '@/lib/api/indexer'
import { networkKey, statusQuery } from '@/lib/api/queries'
import { CHAINS, type Network } from '@/lib/networks'

/**
 * Refresh a network's fil-api queries after a confirmed write. fil-api lags
 * the chain, so refetching right away would cache pre-write data; this waits
 * for the indexers to reach the current chain head first (or times out) and
 * then invalidates. Fire and forget: it never throws.
 *
 * @param network - Network the write landed on.
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations
 */
export function useRefreshWhenIndexed(network: Network) {
  const queryClient = useQueryClient()
  const config = useConfig()
  return useCallback(() => {
    const refresh = async () => {
      try {
        const block = await getBlockNumber(config, {
          chainId: CHAINS[network].id,
        })
        await waitForIndexer({
          block,
          getStatus: () =>
            queryClient.fetchQuery({ ...statusQuery(network), staleTime: 0 }),
        })
      } finally {
        await queryClient.invalidateQueries({ queryKey: networkKey(network) })
      }
    }
    refresh().catch(() => {
      // The finally block already invalidated; nothing else to recover.
    })
  }, [config, network, queryClient])
}
