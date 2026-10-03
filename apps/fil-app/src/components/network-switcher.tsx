import { useLocation, useNavigate } from '@tanstack/react-router'
import { GlobeIcon } from 'lucide-react'
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

/**
 * Explorer network picker that swaps the leading path segment and keeps the
 * rest of the path.
 *
 * @param props.network - Current network.
 */
export function NetworkSwitcher(props: { network: Network }) {
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
      <SelectTrigger aria-label="Network" size="sm">
        <GlobeIcon />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {NETWORKS.map((network) => (
          <SelectItem key={network} value={network}>
            <span
              aria-hidden
              className={
                network === 'mainnet'
                  ? 'size-2 rounded-full bg-success'
                  : 'size-2 rounded-full bg-violet-500'
              }
            />
            {NETWORK_LABELS[network]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
