import { Link, useLocation } from '@tanstack/react-router'
import {
  ArrowLeftRightIcon,
  BookOpenIcon,
  ChevronsUpDownIcon,
  CompassIcon,
  DatabaseIcon,
  HouseIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SearchIcon,
  ShieldCheckIcon,
  SunIcon,
  SunMoonIcon,
  UploadIcon,
  WalletIcon,
} from 'lucide-react'
import { useConnection, useDisconnect, useSwitchChain } from 'wagmi'
import { CommandShortcutKeys, useCommandMenu } from '@/components/command-menu'
import { useDashboard } from '@/components/dashboard-context'
import { Logo } from '@/components/logo'
import { NetworkDot } from '@/components/network-switcher'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { shortHex } from '@/lib/format'
import { CHAINS, NETWORK_LABELS, NETWORKS } from '@/lib/networks'
import { type ThemePreference, useTheme } from '@/lib/theme'

/** Dashboard navigation, grouped by what the pages manage. */
const NAV_GROUPS = [
  {
    label: null,
    items: [{ to: '/dashboard', label: 'Overview', icon: LayoutDashboardIcon }],
  },
  {
    label: 'Payments',
    items: [
      { to: '/dashboard/account', label: 'Pay account', icon: WalletIcon },
      { to: '/dashboard/approvals', label: 'Approvals', icon: ShieldCheckIcon },
      { to: '/dashboard/rails', label: 'Rails', icon: ArrowLeftRightIcon },
    ],
  },
  {
    label: 'Storage',
    items: [
      { to: '/dashboard/data-sets', label: 'Data sets', icon: DatabaseIcon },
      { to: '/dashboard/upload', label: 'Upload', icon: UploadIcon },
    ],
  },
  {
    label: 'Access',
    items: [
      {
        to: '/dashboard/session-keys',
        label: 'Session keys',
        icon: KeyRoundIcon,
      },
    ],
  },
] as const

/**
 * Whether a nav item matches the current path. Overview only matches
 * exactly; sections also match their detail pages.
 *
 * @param pathname - Current pathname.
 * @param to - Nav item path.
 */
function isActive(pathname: string, to: string) {
  const path = pathname.replace(/\/$/, '')
  return to === '/dashboard'
    ? path === to
    : path === to || path.startsWith(`${to}/`)
}

/** Brand and current network; links back to the overview. */
function Brand() {
  const { network } = useDashboard()
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => isMobile && setOpenMobile(false)}
          render={<Link to="/dashboard" />}
          size="lg"
        >
          <Logo className="size-9! shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-none">
            <span className="truncate font-semibold">Filecoin dashboard</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <NetworkDot network={network} />
              {NETWORK_LABELS[network]}
            </span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** Links out of the dashboard, to the site and the explorer. */
function SiteLinks() {
  const { network } = useDashboard()
  const { isMobile, setOpenMobile } = useSidebar()
  const close = () => isMobile && setOpenMobile(false)
  return (
    <SidebarGroup className="mt-auto">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={close} render={<Link to="/" />}>
              <HouseIcon />
              <span>Home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={close}
              render={<Link params={{ network }} to="/$network" />}
            >
              <CompassIcon />
              <span>Explorer</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={close} render={<Link to="/docs" />}>
              <BookOpenIcon />
              <span>Docs</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

/** Search field look-alike that opens the command menu. */
function SidebarSearch() {
  const { setOpen } = useCommandMenu()
  return (
    <button
      className="flex h-9 w-full items-center gap-2 rounded-xl border bg-background px-3 text-sm text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring dark:bg-input/30"
      onClick={() => setOpen(true)}
      type="button"
    >
      <SearchIcon className="size-4" />
      <span className="flex-1 text-left">Search…</span>
      <CommandShortcutKeys />
    </button>
  )
}

const THEMES: {
  value: ThemePreference
  label: string
  icon: typeof SunIcon
}[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
]

/**
 * The one sidebar menu: connected wallet, wallet network, the signer for
 * storage actions, explorer link, theme and disconnect.
 */
function AccountMenu() {
  const { address, network, storedKeys, activeKey, setActiveKey } =
    useDashboard()
  const connection = useConnection()
  const { mutate: switchChain } = useSwitchChain()
  const { mutate: disconnect } = useDisconnect()
  const { theme, setTheme } = useTheme()
  const icon = connection.connector?.icon
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                className="data-popup-open:bg-sidebar-accent"
                size="lg"
              />
            }
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              {icon ? (
                <img
                  alt=""
                  className="size-5"
                  height={20}
                  src={icon}
                  width={20}
                />
              ) : (
                <WalletIcon />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-none">
              <span className="truncate font-mono text-sm">
                {shortHex(address)}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {activeKey
                  ? `Signing with ${activeKey.label || 'session key'}`
                  : 'Signing with wallet'}
              </span>
            </span>
            <ChevronsUpDownIcon className="ml-auto text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-(--anchor-width) min-w-60"
            side="top"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>Network</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                onValueChange={(next) =>
                  switchChain({ chainId: CHAINS[next as typeof network].id })
                }
                value={network}
              >
                {NETWORKS.map((name) => (
                  <DropdownMenuRadioItem key={name} value={name}>
                    <NetworkDot network={name} />
                    {NETWORK_LABELS[name]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Sign storage actions with</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                onValueChange={(next) =>
                  setActiveKey(next === 'wallet' ? null : (next as string))
                }
                value={activeKey?.address ?? 'wallet'}
              >
                <DropdownMenuRadioItem value="wallet">
                  <WalletIcon />
                  Wallet
                </DropdownMenuRadioItem>
                {storedKeys.map((key) => (
                  <DropdownMenuRadioItem key={key.address} value={key.address}>
                    <KeyRoundIcon />
                    <span className="truncate">
                      {key.label || `Key ${shortHex(key.address)}`}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link
                  params={{ network, address: address.toLowerCase() }}
                  to="/$network/address/$address"
                />
              }
            >
              <CompassIcon />
              View in explorer
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <SunMoonIcon />
                Theme
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  onValueChange={(value) => setTheme(value as ThemePreference)}
                  value={theme}
                >
                  {THEMES.map((item) => (
                    <DropdownMenuRadioItem key={item.value} value={item.value}>
                      <item.icon />
                      {item.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => disconnect()}
              variant="destructive"
            >
              <LogOutIcon />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/**
 * Dashboard sidebar: brand and network, search, grouped navigation, links
 * back to the site and the explorer, and the account menu. Becomes a sheet on mobile.
 *
 * @see https://ui.shadcn.com/blocks/sidebar#sidebar-01
 */
export function DashboardSidebar() {
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    <Sidebar>
      <SidebarHeader className="gap-3">
        <Brand />
        <SidebarSearch />
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label ?? 'home'}>
            {group.label ? (
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={isActive(pathname, item.to)}
                      onClick={() => isMobile && setOpenMobile(false)}
                      render={<Link to={item.to} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        <SiteLinks />
      </SidebarContent>
      <SidebarFooter>
        <AccountMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
