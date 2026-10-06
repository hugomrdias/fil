import { Link, useMatchRoute } from '@tanstack/react-router'
import { LayoutDashboardIcon, MenuIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useConnection } from 'wagmi'
import { SearchTrigger } from '@/components/command-menu'
import { Wordmark } from '@/components/logo'
import { NetworkSwitcher } from '@/components/network-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useExplorerNetwork } from '@/hooks/use-explorer-network'
import { shortHex } from '@/lib/format'

/** Explorer sections. Overview is active only on the explorer home. */
const NAV = [
  { to: '/$network', label: 'Overview', exact: true },
  { to: '/$network/data-sets', label: 'Data sets' },
  { to: '/$network/providers', label: 'Providers' },
  { to: '/$network/rails', label: 'Rails' },
  { to: '/$network/session-keys', label: 'Session keys' },
] as const

/**
 * Link to the dashboard; shows the connected wallet when there is one.
 *
 * @param props.className - Extra classes.
 */
export function DashboardButton(props: { className?: string }) {
  const connection = useConnection()
  const address = connection.status === 'connected' && connection.address
  return (
    <Button
      className={props.className}
      nativeButton={false}
      render={<Link to="/dashboard" />}
    >
      <LayoutDashboardIcon />
      {address ? (
        <span className="font-mono">{shortHex(address)}</span>
      ) : (
        'Dashboard'
      )}
    </Button>
  )
}

/** Explorer top bar: brand, sections, search, network, theme, dashboard. */
export function SiteHeader() {
  const network = useExplorerNetwork()
  // The explorer home has its own big search box.
  const onHome = Boolean(useMatchRoute()({ to: '/$network' }))

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <Link aria-label="Home" className="mr-3 shrink-0" to="/">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((item) => (
            <Link
              activeOptions={{ exact: 'exact' in item }}
              className="rounded-4xl px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
              key={item.to}
              params={{ network }}
              to={item.to}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {onHome ? null : <SearchTrigger />}
          <NetworkSwitcher className="max-sm:hidden" network={network} />
          <ThemeToggle className="max-lg:hidden" />
          <DashboardButton className="max-sm:hidden" />
          <MobileMenu network={network} />
        </div>
      </div>
    </header>
  )
}

/**
 * Sheet with the explorer sections and settings below `lg`.
 *
 * @param props.network - Current network.
 */
function MobileMenu(props: { network: ReturnType<typeof useExplorerNetwork> }) {
  const { network } = props
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            aria-label="Menu"
            className="lg:hidden"
            size="icon"
            variant="ghost"
          />
        }
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent className="w-72" side="right">
        <SheetHeader>
          <SheetTitle>Explorer</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map((item) => (
            <SheetClose
              key={item.to}
              nativeButton={false}
              render={
                <Link
                  activeOptions={{ exact: 'exact' in item }}
                  className="rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground"
                  params={{ network }}
                  to={item.to}
                />
              }
            >
              {item.label}
            </SheetClose>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t p-4">
          <MenuRow label="Network">
            <NetworkSwitcher network={network} />
          </MenuRow>
          <MenuRow label="Theme">
            <ThemeToggle />
          </MenuRow>
          <SheetClose
            nativeButton={false}
            render={<DashboardButton className="w-full" />}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Label and control on one line in the mobile menu.
 *
 * @param props.label - Row label.
 * @param props.children - Control.
 */
export function MenuRow(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{props.label}</span>
      {props.children}
    </div>
  )
}

/** Explorer footer. */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 sm:px-6 lg:px-8 text-sm text-muted-foreground">
        <span>Indexed by fil-api from Filecoin chain data.</span>
        <div className="flex gap-5">
          <a
            className="transition-colors hover:text-foreground"
            href="https://fil-api.hugomrdias.dev/docs"
            rel="noreferrer"
            target="_blank"
          >
            API
          </a>
          <Link className="transition-colors hover:text-foreground" to="/docs">
            Docs
          </Link>
        </div>
      </div>
    </footer>
  )
}

/**
 * Explorer page frame: top bar, content and footer.
 *
 * @param props.children - Page content.
 */
export function ExplorerShell(props: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">{props.children}</main>
      <SiteFooter />
    </div>
  )
}
