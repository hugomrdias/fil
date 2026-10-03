import { erc20Abi, isAddress, isAddressEqual, zeroAddress } from 'viem'
import { useReadContracts } from 'wagmi'
import { CHAINS, type Network } from '@/lib/networks'

/** Display metadata for an ERC20 token. */
export interface TokenInfo {
  symbol: string
  decimals: number
}

/**
 * Symbol and decimals for a token, using USDFC from the chain definition and
 * an on-chain lookup for anything else.
 *
 * @param network - Filecoin network.
 * @param token - Token address.
 * @see https://wagmi.sh/react/api/hooks/useReadContracts
 */
export function useTokenInfo(network: Network, token: string | undefined) {
  const chain = CHAINS[network]
  const isUsdfc =
    token !== undefined &&
    isAddress(token, { strict: false }) &&
    isAddressEqual(token, chain.contracts.usdfc.address)
  const isNative = token === undefined || token === zeroAddress
  const { data } = useReadContracts({
    allowFailure: false,
    contracts: [
      {
        abi: erc20Abi,
        address: token as `0x${string}`,
        chainId: chain.id,
        functionName: 'symbol',
      },
      {
        abi: erc20Abi,
        address: token as `0x${string}`,
        chainId: chain.id,
        functionName: 'decimals',
      },
    ],
    query: { enabled: !(isUsdfc || isNative), staleTime: Infinity },
  })

  if (isUsdfc) {
    return { symbol: 'USDFC', decimals: 18 } satisfies TokenInfo
  }
  if (isNative) {
    return { symbol: 'FIL', decimals: 18 } satisfies TokenInfo
  }
  return {
    symbol: data?.[0] ?? '?',
    decimals: data?.[1] ?? 18,
  } satisfies TokenInfo
}
