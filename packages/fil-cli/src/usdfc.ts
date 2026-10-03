import { formatUnits } from 'viem'

/** Decimals of the USDFC token. */
const USDFC_DECIMALS = 18

/** Format a USDFC base-unit amount as a decimal string. */
export function formatUsdfc(value: bigint): string {
  return formatUnits(value, USDFC_DECIMALS)
}
