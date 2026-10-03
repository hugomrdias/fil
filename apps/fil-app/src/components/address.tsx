import { Link } from '@tanstack/react-router'
import { CopyButton } from '@/components/copy-button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { shortHex } from '@/lib/format'
import type { Network } from '@/lib/networks'

/** Props for {@link Address}. */
export interface AddressProps {
  /** 0x address; renders a dash when empty. */
  value: string | null | undefined
  /** Network for the explorer link; omit to render plain text. */
  network?: Network
  /** Show the full address instead of a shortened one. */
  full?: boolean
  /** Hide the copy button. */
  noCopy?: boolean
}

/**
 * Address with a tooltip, explorer address-page link and copy button.
 */
export function Address(props: AddressProps) {
  if (!props.value) {
    return <span className="text-muted-foreground">—</span>
  }
  const text = props.full ? props.value : shortHex(props.value)
  const label = props.network ? (
    <Link
      className="font-mono text-primary hover:underline"
      params={{ network: props.network, address: props.value.toLowerCase() }}
      to="/$network/address/$address"
    >
      {text}
    </Link>
  ) : (
    <span className="font-mono">{text}</span>
  )

  return (
    <span className="inline-flex items-center gap-0.5">
      {props.full ? (
        label
      ) : (
        <Tooltip>
          <TooltipTrigger render={<span />}>{label}</TooltipTrigger>
          <TooltipContent className="font-mono">{props.value}</TooltipContent>
        </Tooltip>
      )}
      {props.noCopy ? null : <CopyButton value={props.value} />}
    </span>
  )
}
