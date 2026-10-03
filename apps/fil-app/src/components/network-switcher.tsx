import { useLocation, useNavigate } from '@tanstack/react-router'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  isNetwork,
  NETWORK_LABELS,
  NETWORKS,
  type Network,
  switchNetworkPath,
} from '@/lib/networks'
import { cn } from '@/lib/utils'

/**
 * Dot that tells networks apart at a glance: green for mainnet, violet
 * for the calibration testnet.
 *
 * @param props.network - Filecoin network.
 */
export function NetworkDot(props: { network: Network }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-2 shrink-0 rounded-full',
        props.network === 'mainnet' ? 'bg-success' : 'bg-violet-500'
      )}
    />
  )
}

/**
 * Explorer network picker that swaps the leading path segment and keeps the
 * rest of the path.
 *
 * @param props.network - Current network.
 * @param props.className - Extra trigger classes.
 */
export function NetworkSwitcher(props: {
  network: Network
  className?: string
}) {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <Select
      items={NETWORKS.map((network) => ({
        value: network,
        label: NETWORK_LABELS[network],
      }))}
      onValueChange={(value) => {
        if (isNetwork(value)) {
          navigate({ to: switchNetworkPath(location.pathname, value) })
        }
      }}
      value={props.network}
    >
      <SelectTrigger aria-label="Network" className={props.className}>
        <NetworkDot network={props.network} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {NETWORKS.map((network) => (
          <SelectItem key={network} value={network}>
            <NetworkDot network={network} />
            {NETWORK_LABELS[network]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
