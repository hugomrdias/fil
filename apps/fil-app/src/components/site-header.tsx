import { Link, useParams } from '@tanstack/react-router'
import { MenuIcon } from 'lucide-react'
import { ConnectButton } from '@/components/connect-button'
import { Logo } from '@/components/logo'
import { NetworkSwitcher } from '@/components/network-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useExplorerNetwork } from '@/hooks/use-explorer-network'
import { isNetwork } from '@/lib/networks'

const NAV = [
  { to: '/$network/data-sets', label: 'Data sets' },
  { to: '/$network/providers', label: 'Providers' },
  { to: '/$network/rails', label: 'Rails' },
  { to: '/$network/session-keys', label: 'Session keys' },
] as const

const LINK_CLASS =
  'px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground data-[status=active]:font-medium'

/** Explorer and dashboard navigation links. */
function NavLinks() {
  const network = useExplorerNetwork()
  return (
    <>
      {NAV.map((item) => (
        <Link
          className={LINK_CLASS}
          key={item.to}
          params={{ network }}
          to={item.to}
        >
          {item.label}
        </Link>
      ))}
      <Link className={LINK_CLASS} to="/dashboard">
        Dashboard
      </Link>
    </>
  )
}

/** Sticky top bar with brand, navigation, network, wallet and theme. */
export function SiteHeader() {
  const network = useExplorerNetwork()
  const params = useParams({ strict: false }) as { network?: string }
  const inExplorer = isNetwork(params.network)

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4">
        <Link
          className="flex items-center gap-2 font-semibold"
          params={{ network }}
          to="/$network"
        >
          <Logo className="size-7" />
          <span className="hidden sm:inline">fil-app</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <NavLinks />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {inExplorer ? <NetworkSwitcher network={network} /> : null}
          <ConnectButton />
          <ThemeToggle />
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  aria-label="Menu"
                  className="md:hidden"
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>fil-app</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 px-4">
                <NavLinks />
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

/** Page footer. */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground">
        <span>Filecoin Onchain Cloud explorer · data from fil-api</span>
        <div className="flex gap-4">
          <a
            className="hover:text-foreground"
            href="https://fil-api.hugomrdias.dev/docs"
            rel="noreferrer"
            target="_blank"
          >
            API
          </a>
          <a
            className="hover:text-foreground"
            href="https://docs.filecoin.cloud"
            rel="noreferrer"
            target="_blank"
          >
            Docs
          </a>
        </div>
      </div>
    </footer>
  )
}
