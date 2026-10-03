import type { ReactNode } from 'react'
import { useTokenInfo } from '@/hooks/use-token-info'
import { formatUnitsDisplay } from '@/lib/format'
import { CHAINS, type Network } from '@/lib/networks'

/** Props for {@link TokenAmount}. */
export interface TokenAmountProps {
  /** Amount in base units. */
  value: bigint | string | number | null | undefined
  /** Network the token lives on. */
  network: Network
  /** Token address; defaults to USDFC. */
  token?: string
  /** Suffix such as `/day`. */
  suffix?: string
  /** Max fraction digits. */
  digits?: number
}

/**
 * Formatted token amount with symbol, e.g. `12.5 USDFC/day`.
 */
export function TokenAmount(props: TokenAmountProps) {
  const info = useTokenInfo(
    props.network,
    props.token ?? CHAINS[props.network].contracts.usdfc.address
  )
  return (
    <span className="tabular-nums">
      {formatUnitsDisplay(props.value, info.decimals, props.digits ?? 4)}{' '}
      <span className="text-muted-foreground">
        {info.symbol}
        {props.suffix ?? ''}
      </span>
    </span>
  )
}

/**
 * Build a renderer that shows a USDFC amount, or `…` while it is loading.
 *
 * @param network - Network the token lives on.
 * @returns `(value, suffix?) => node`
 */
export function amountOrPending(network: Network) {
  return (value: bigint | undefined, suffix?: string): ReactNode =>
    value === undefined ? (
      '…'
    ) : (
      <TokenAmount network={network} suffix={suffix} value={value} />
    )
}
