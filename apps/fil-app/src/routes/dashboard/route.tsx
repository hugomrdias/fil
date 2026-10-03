import type { Permission } from '@filoz/synapse-core/session-key'
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import {
  ArrowLeftRightIcon,
  DatabaseIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  ShieldCheckIcon,
  UploadIcon,
  WalletIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { useConnection, useSwitchChain } from 'wagmi'
import { ConnectButton } from '@/components/connect-button'
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/components/dashboard-context'
import { EmptyState, ErrorState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStoredSessionKeys } from '@/hooks/use-session-key-store'
import { useSessionKey } from '@/hooks-synapse'
import { shortHex } from '@/lib/format'
import {
  CHAINS,
  NETWORK_LABELS,
  NETWORKS,
  networkForChainId,
} from '@/lib/networks'

export const Route = createFileRoute('/dashboard')({
  component: DashboardLayout,
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <ErrorState error={error} reset={reset} />
    </div>
  ),
})

const NAV = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboardIcon },
  { to: '/dashboard/account', label: 'Pay account', icon: WalletIcon },
  { to: '/dashboard/approvals', label: 'Approvals', icon: ShieldCheckIcon },
  { to: '/dashboard/data-sets', label: 'Data sets', icon: DatabaseIcon },
  { to: '/dashboard/upload', label: 'Upload', icon: UploadIcon },
  { to: '/dashboard/rails', label: 'Rails', icon: ArrowLeftRightIcon },
  { to: '/dashboard/session-keys', label: 'Session keys', icon: KeyRoundIcon },
] as const

/** Wallet-gated dashboard shell. */
function DashboardLayout() {
  const connection = useConnection()
  const { mutate: switchChain, isPending } = useSwitchChain()

  if (connection.status !== 'connected' || !connection.address) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16">
        <EmptyState
          description="Connect a browser wallet to manage your Filecoin Pay account, data sets, rails and session keys."
          icon={<WalletIcon />}
          title="Connect your wallet"
        >
          <ConnectButton />
        </EmptyState>
      </div>
    )
  }

  const network = networkForChainId(connection.chainId)
  if (!network) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16">
        <EmptyState
          description={`Your wallet is on chain ${connection.chainId}. Switch to a Filecoin network to continue.`}
          icon={<ArrowLeftRightIcon />}
          title="Unsupported network"
        >
          <div className="flex gap-2">
            {NETWORKS.map((name) => (
              <Button
                disabled={isPending}
                key={name}
                onClick={() => switchChain({ chainId: CHAINS[name].id })}
                variant={name === 'calibration' ? 'outline' : 'default'}
              >
                Switch to {NETWORK_LABELS[name]}
              </Button>
            ))}
          </div>
        </EmptyState>
      </div>
    )
  }

  return (
    <DashboardShell
      address={connection.address}
      chainId={connection.chainId}
      key={`${connection.chainId}:${connection.address}`}
      network={network}
    />
  )
}

/**
 * Dashboard layout with sidebar navigation and session key context.
 *
 * @param props - Connected wallet, chain and network.
 */
function DashboardShell(
  props: Pick<DashboardContextValue, 'address' | 'chainId' | 'network'>
) {
  const { address, chainId, network } = props
  const { mutate: switchChain } = useSwitchChain()
  const { keys, active, add, remove, setActive } = useStoredSessionKeys(
    chainId,
    address
  )
  const activeKey = keys.find((key) => key.address === active) ?? null
  const { sessionKey, expirations, isSyncing, hasPermissions } = useSessionKey({
    privateKey: activeKey?.privateKey,
    root: address,
    chainId,
  })

  const value = useMemo<DashboardContextValue>(
    () => ({
      address,
      chainId,
      network,
      storedKeys: keys,
      addKey: add,
      removeKey: remove,
      activeKey,
      setActiveKey: setActive,
      sessionKey,
      activeExpirations: isSyncing ? null : expirations,
      signerFor: (permissions: Permission[]) =>
        sessionKey && hasPermissions(permissions) ? sessionKey : null,
    }),
    [
      address,
      chainId,
      network,
      keys,
      add,
      remove,
      activeKey,
      setActive,
      sessionKey,
      isSyncing,
      expirations,
      hasPermissions,
    ]
  )

  const signerItems = [
    { value: 'wallet', label: 'Wallet' },
    ...keys.map((key) => ({
      value: key.address,
      label: `${key.label || 'Session key'} · ${shortHex(key.address)}`,
    })),
  ]

  return (
    <DashboardContext.Provider value={value}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 lg:flex-row">
        <aside className="flex shrink-0 flex-col gap-4 lg:w-56">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {NAV.map((item) => (
              <Link
                activeOptions={{ exact: item.to === '/dashboard' }}
                className="flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-accent-foreground"
                key={item.to}
                to={item.to}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-3 border p-3 text-xs">
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground">Network</span>
              <Select
                items={NETWORKS.map((name) => ({
                  value: name,
                  label: NETWORK_LABELS[name],
                }))}
                onValueChange={(next) =>
                  switchChain({ chainId: CHAINS[next as typeof network].id })
                }
                value={network}
              >
                <SelectTrigger
                  aria-label="Wallet network"
                  className="w-full"
                  size="sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NETWORKS.map((name) => (
                    <SelectItem key={name} value={name}>
                      {NETWORK_LABELS[name]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground">
                Sign storage actions with
              </span>
              <Select
                items={signerItems}
                onValueChange={(next) =>
                  value.setActiveKey(
                    next === 'wallet' ? null : (next as string)
                  )
                }
                value={activeKey?.address ?? 'wallet'}
              >
                <SelectTrigger aria-label="Signer" className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {signerItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <Outlet />
        </div>
      </div>
    </DashboardContext.Provider>
  )
}
