import { Link } from '@tanstack/react-router'
import {
  ChevronDownIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  SearchIcon,
  WalletIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  type Connector,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
} from 'wagmi'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { shortHex } from '@/lib/format'
import { DEFAULT_NETWORK, networkForChainId } from '@/lib/networks'

/**
 * Wallet connect / account menu using EIP-6963 injected wallets.
 *
 * @see https://wagmi.sh/react/api/hooks/useConnect
 */
export function ConnectButton() {
  const connection = useConnection()
  const connectors: readonly Connector[] = useConnectors()
  const { mutate: connect, isPending } = useConnect({
    mutation: {
      onError: (error) => toast.error(error.message),
    },
  })
  const { mutate: disconnect } = useDisconnect()

  if (connection.status === 'connected' && connection.address) {
    const network = networkForChainId(connection.chainId) ?? DEFAULT_NETWORK
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
          {connection.connector?.icon ? (
            <img
              alt=""
              className="size-4"
              height={16}
              src={connection.connector.icon}
              width={16}
            />
          ) : (
            <WalletIcon />
          )}
          <span className="font-mono">{shortHex(connection.address)}</span>
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {connection.connector?.name ?? 'Wallet'} ·{' '}
              {connection.chain?.name ?? `Chain ${connection.chainId}`}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link to="/dashboard" />}>
            <LayoutDashboardIcon />
            Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <Link
                params={{
                  network,
                  address: connection.address.toLowerCase(),
                }}
                to="/$network/address/$address"
              />
            }
          >
            <SearchIcon />
            View in explorer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => disconnect()} variant="destructive">
            <LogOutIcon />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button disabled={isPending} size="sm" />}>
        <WalletIcon />
        {isPending ? 'Connecting…' : 'Connect wallet'}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Browser wallets</DropdownMenuLabel>
        </DropdownMenuGroup>
        {connectors.length === 0 ? (
          <DropdownMenuItem disabled>No wallet detected</DropdownMenuItem>
        ) : null}
        {connectors.map((connector) => (
          <DropdownMenuItem
            key={connector.uid}
            onClick={() => connect({ connector })}
          >
            {connector.icon ? (
              <img
                alt=""
                className="size-4"
                height={16}
                src={connector.icon}
                width={16}
              />
            ) : (
              <WalletIcon />
            )}
            {connector.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
