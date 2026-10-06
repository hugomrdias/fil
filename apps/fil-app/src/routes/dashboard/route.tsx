import type { Permission } from '@filoz/synapse-core/session-key'
import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useConnection, useSwitchChain } from 'wagmi'
import { SearchTrigger } from '@/components/command-menu'
import { Crumbs } from '@/components/crumbs'
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/components/dashboard-context'
import { DashboardSidebar } from '@/components/dashboard-sidebar'
import { ErrorState } from '@/components/empty-state'
import { NetworkDot } from '@/components/network-switcher'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { ConnectGate, GateFrame } from '@/components/wallet-gate'
import { useStoredSessionKeys } from '@/hooks/use-session-key-store'
import { useSessionKey } from '@/hooks-synapse'
import {
  CHAINS,
  NETWORK_LABELS,
  NETWORKS,
  networkForChainId,
} from '@/lib/networks'

export const Route = createFileRoute('/dashboard')({
  component: DashboardLayout,
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <ErrorState error={error} reset={reset} />
    </div>
  ),
})

/** Wallet-gated dashboard: connect, then the right network, then the shell. */
function DashboardLayout() {
  const connection = useConnection()
  const { mutate: switchChain, isPending } = useSwitchChain()
  const pathname = useLocation({ select: (location) => location.pathname })

  if (connection.status !== 'connected' || !connection.address) {
    return pathname === '/dashboard/setup' ? (
      <ConnectGate
        description="A tool or agent asked to set up your wallet. Connect the wallet that should approve it; you review every step before anything is signed."
        title="Connect a wallet to review a setup request"
      />
    ) : (
      <ConnectGate />
    )
  }

  const network = networkForChainId(connection.chainId)
  if (!network) {
    return (
      <GateFrame
        description={`Your wallet is on chain ${connection.chainId}. The dashboard works on Filecoin Mainnet and the Calibration testnet.`}
        title="Switch your wallet to Filecoin"
      >
        {NETWORKS.map((name) => (
          <Button
            className="h-12 justify-start gap-3 px-4"
            disabled={isPending}
            key={name}
            onClick={() => switchChain({ chainId: CHAINS[name].id })}
            size="lg"
            variant="outline"
          >
            <NetworkDot network={name} />
            Switch to {NETWORK_LABELS[name]}
          </Button>
        ))}
      </GateFrame>
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
 * Sidebar shell with the session key context every dashboard page reads.
 *
 * @param props - Connected wallet, chain and network.
 * @see https://ui.shadcn.com/blocks/sidebar#sidebar-01
 */
function DashboardShell(
  props: Pick<DashboardContextValue, 'address' | 'chainId' | 'network'>
) {
  const { address, chainId, network } = props
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

  return (
    <DashboardContext.Provider value={value}>
      <SidebarProvider>
        <DashboardSidebar />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-md">
            <SidebarTrigger className="-ml-1.5" />
            <Separator
              className="mr-1 data-vertical:h-4 data-vertical:self-center"
              orientation="vertical"
            />
            <Crumbs className="flex-1" />
            <SearchTrigger className="ml-auto md:hidden" />
          </header>
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </DashboardContext.Provider>
  )
}
