import { useInfiniteQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeftRightIcon,
  DatabaseIcon,
  FileIcon,
  GlobeIcon,
  HardDriveIcon,
  HouseIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  MonitorIcon,
  MoonIcon,
  SearchIcon,
  ServerIcon,
  ShieldCheckIcon,
  SunIcon,
  UploadIcon,
  UserIcon,
  WalletIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useSwitchChain } from 'wagmi'
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { providersInfinite } from '@/lib/api/queries'
import { shortHex, shortId } from '@/lib/format'
import {
  CHAINS,
  NETWORK_LABELS,
  NETWORKS,
  type Network,
  switchNetworkPath,
} from '@/lib/networks'
import { useFlatPages } from '@/lib/route-helpers'
import { classifySearch } from '@/lib/search'
import { type ThemePreference, useTheme } from '@/lib/theme'

/** Explorer pages listed in the palette. */
const EXPLORER_PAGES = [
  { to: '/$network', label: 'Explorer home', icon: HouseIcon },
  { to: '/$network/data-sets', label: 'Data sets', icon: DatabaseIcon },
  { to: '/$network/providers', label: 'Providers', icon: ServerIcon },
  { to: '/$network/rails', label: 'Rails', icon: ArrowLeftRightIcon },
  { to: '/$network/session-keys', label: 'Session keys', icon: KeyRoundIcon },
] as const

/** Dashboard pages listed in the palette. */
export const DASHBOARD_PAGES = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboardIcon },
  { to: '/dashboard/account', label: 'Pay account', icon: WalletIcon },
  { to: '/dashboard/approvals', label: 'Approvals', icon: ShieldCheckIcon },
  { to: '/dashboard/data-sets', label: 'Data sets', icon: DatabaseIcon },
  { to: '/dashboard/upload', label: 'Upload', icon: UploadIcon },
  { to: '/dashboard/rails', label: 'Rails', icon: ArrowLeftRightIcon },
  { to: '/dashboard/session-keys', label: 'Session keys', icon: KeyRoundIcon },
] as const

const THEMES: {
  value: ThemePreference
  label: string
  icon: typeof SunIcon
}[] = [
  { value: 'light', label: 'Light theme', icon: SunIcon },
  { value: 'dark', label: 'Dark theme', icon: MoonIcon },
  { value: 'system', label: 'System theme', icon: MonitorIcon },
]

/**
 * One palette row.
 *
 * @param props.value - Unique cmdk value, also matched against the query.
 * @param props.icon - Leading icon.
 * @param props.hint - Trailing muted text.
 * @param props.onSelect - Action to run.
 * @param props.forceMount - Show regardless of the query filter.
 */
function Row(props: {
  value: string
  icon: ReactNode
  children: ReactNode
  hint?: ReactNode
  keywords?: string[]
  forceMount?: boolean
  onSelect: () => void
}) {
  return (
    <CommandItem
      forceMount={props.forceMount}
      keywords={props.keywords}
      onSelect={props.onSelect}
      value={props.value}
    >
      {props.icon}
      <span className="min-w-0 truncate">{props.children}</span>
      {props.hint ? (
        <CommandShortcut className="pl-3 font-normal tracking-normal">
          {props.hint}
        </CommandShortcut>
      ) : null}
    </CommandItem>
  )
}

/**
 * Palette results for a query: direct lookups for addresses, PieceCIDs
 * and ids, providers by name, pages, network and theme. Renders inside a
 * cmdk `Command`, so the ⌘K dialog and the homepage search share it.
 *
 * @param props.query - Current input.
 * @param props.network - Network that lookups and explorer pages use.
 * @param props.onDone - Called after an item runs, e.g. to close a dialog.
 * @param props.loadProviders - Whether to fetch providers for name search.
 * @see https://ui.shadcn.com/docs/components/base/command
 */
export function SearchCommandItems(props: {
  query: string
  network: Network
  onDone: () => void
  loadProviders: boolean
}) {
  const { network, onDone } = props
  const navigate = useNavigate()
  const location = useLocation()
  const { setTheme } = useTheme()
  const { mutate: switchChain } = useSwitchChain()
  const query = props.query.trim()
  const target = classifySearch(query)
  const providers = useFlatPages(
    useInfiniteQuery({
      ...providersInfinite(network, { approved: 'true' }, 100),
      enabled: props.loadProviders,
    }).data
  )
  const inDashboard = location.pathname.startsWith('/dashboard')

  /** Run an action, then let the host close or reset. */
  const run = (action: () => void) => () => {
    action()
    onDone()
  }

  return (
    <>
      {target.type === 'invalid' ? (
        <CommandEmpty>
          No matches. Try a 0x address, a PieceCID, or a data set, rail or
          provider id.
        </CommandEmpty>
      ) : null}

      {target.type === 'address' ? (
        <CommandGroup forceMount heading="Look up">
          <Row
            forceMount
            hint={NETWORK_LABELS[network]}
            icon={<UserIcon />}
            onSelect={run(() =>
              navigate({
                to: '/$network/address/$address',
                params: { network, address: target.address },
              })
            )}
            value={`lookup:${target.address}`}
          >
            Address{' '}
            <span className="font-mono">{shortHex(target.address, 6)}</span>
          </Row>
        </CommandGroup>
      ) : null}

      {target.type === 'piece' ? (
        <CommandGroup forceMount heading="Look up">
          <Row
            forceMount
            hint={NETWORK_LABELS[network]}
            icon={<FileIcon />}
            onSelect={run(() =>
              navigate({
                to: '/$network/pieces/$cid',
                params: { network, cid: target.cid },
              })
            )}
            value={`lookup:${target.cid}`}
          >
            Piece <span className="font-mono">{shortId(target.cid, 10)}</span>
          </Row>
        </CommandGroup>
      ) : null}

      {target.type === 'id' ? (
        <CommandGroup forceMount heading="Look up">
          <Row
            forceMount
            icon={<DatabaseIcon />}
            onSelect={run(() =>
              navigate({
                to: '/$network/data-sets/$id',
                params: { network, id: target.id },
              })
            )}
            value={`lookup:data-set:${target.id}`}
          >
            Data set #{target.id}
          </Row>
          <Row
            forceMount
            icon={<ArrowLeftRightIcon />}
            onSelect={run(() =>
              navigate({
                to: '/$network/rails/$id',
                params: { network, id: target.id },
              })
            )}
            value={`lookup:rail:${target.id}`}
          >
            Rail #{target.id}
          </Row>
          <Row
            forceMount
            icon={<ServerIcon />}
            onSelect={run(() =>
              navigate({
                to: '/$network/providers/$id',
                params: { network, id: target.id },
              })
            )}
            value={`lookup:provider:${target.id}`}
          >
            Provider #{target.id}
          </Row>
          <Row
            forceMount
            hint="Data sets, rails and providers"
            icon={<SearchIcon />}
            onSelect={run(() =>
              navigate({
                to: '/$network/search',
                params: { network },
                search: { q: target.id },
              })
            )}
            value={`lookup:all:${target.id}`}
          >
            Everything with id {target.id}
          </Row>
        </CommandGroup>
      ) : null}

      {target.type === 'invalid' && query && providers.length > 0 ? (
        <CommandGroup heading="Providers">
          {providers.map((provider) => (
            <Row
              hint={`#${provider.providerId}`}
              icon={<HardDriveIcon />}
              key={provider.providerId}
              keywords={[provider.providerId]}
              onSelect={run(() =>
                navigate({
                  to: '/$network/providers/$id',
                  params: { network, id: provider.providerId },
                })
              )}
              value={`provider:${provider.providerId}:${provider.name ?? ''}`}
            >
              {provider.name || `Provider #${provider.providerId}`}
            </Row>
          ))}
        </CommandGroup>
      ) : null}

      <CommandGroup heading={`Explorer on ${NETWORK_LABELS[network]}`}>
        {EXPLORER_PAGES.map((page) => (
          <Row
            icon={<page.icon />}
            key={page.to}
            onSelect={run(() => navigate({ to: page.to, params: { network } }))}
            value={`explorer:${page.label}`}
          >
            {page.label}
          </Row>
        ))}
      </CommandGroup>

      <CommandGroup heading="Dashboard">
        {DASHBOARD_PAGES.map((page) => (
          <Row
            icon={<page.icon />}
            key={page.to}
            keywords={['dashboard', 'my']}
            onSelect={run(() => navigate({ to: page.to }))}
            value={`dashboard:${page.label}`}
          >
            {page.label}
          </Row>
        ))}
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading="Preferences">
        {NETWORKS.filter((name) => name !== network).map((name) => (
          <Row
            hint={inDashboard ? 'Switches your wallet' : undefined}
            icon={<GlobeIcon />}
            key={name}
            keywords={['network', 'chain']}
            onSelect={run(() =>
              inDashboard
                ? switchChain({ chainId: CHAINS[name].id })
                : navigate({ to: switchNetworkPath(location.pathname, name) })
            )}
            value={`network:${name}`}
          >
            Switch to {NETWORK_LABELS[name]}
          </Row>
        ))}
        {THEMES.map((theme) => (
          <Row
            icon={<theme.icon />}
            key={theme.value}
            keywords={['theme', 'appearance', 'mode']}
            onSelect={run(() => setTheme(theme.value))}
            value={`theme:${theme.value}`}
          >
            {theme.label}
          </Row>
        ))}
      </CommandGroup>
    </>
  )
}
