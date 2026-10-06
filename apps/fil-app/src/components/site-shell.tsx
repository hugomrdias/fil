import { Link } from '@tanstack/react-router'
import { MenuIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Wordmark } from '@/components/logo'
import { DashboardButton, MenuRow } from '@/components/site-header'
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
import { DEFAULT_NETWORK } from '@/lib/networks'

/** Repository on GitHub. */
export const REPO_URL = 'https://github.com/hugomrdias/fil'

const LINK_CLASS =
  'rounded-4xl px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground'

/**
 * Site sections. Docs stays active on every docs page.
 *
 * @param props.className - Link classes.
 */
function SiteNav(props: { className: string }) {
  return (
    <>
      <Link
        activeOptions={{ exact: false }}
        className={props.className}
        to="/docs"
      >
        Docs
      </Link>
      <Link className={props.className} to="/agents">
        Agent setup
      </Link>
      <Link
        className={props.className}
        params={{ network: DEFAULT_NETWORK }}
        to="/$network"
      >
        Explorer
      </Link>
      <a className={props.className} href={REPO_URL}>
        GitHub
      </a>
    </>
  )
}

/** Site top bar: brand, sections, theme, and dashboard. */
function SiteBar() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <Link className="mr-3 shrink-0" to="/">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-0.5 md:flex">
          <SiteNav className={LINK_CLASS} />
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle className="max-md:hidden" />
          <DashboardButton className="max-sm:hidden" />
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
            <SheetContent className="w-72" side="right">
              <SheetHeader>
                <SheetTitle>fil</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-0.5 px-3">
                <SheetClose
                  nativeButton={false}
                  render={<div className="flex flex-col gap-0.5" />}
                >
                  <SiteNav className="rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground" />
                </SheetClose>
              </nav>
              <div className="mt-auto flex flex-col gap-3 border-t p-4">
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
        </div>
      </div>
    </header>
  )
}

/** Site footer with the agent discovery links. */
function SiteFooterLinks() {
  const links = [
    { href: '/llms.txt', label: 'llms.txt' },
    { href: '/.well-known/api-catalog', label: 'API catalog' },
    { href: 'https://fil-api.hugomrdias.dev/docs', label: 'API reference' },
    { href: REPO_URL, label: 'GitHub' },
  ]
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <span>A prototype for Filecoin Onchain Cloud.</span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map((link) => (
            <a
              className="transition-colors hover:text-foreground"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}

/**
 * Frame for the landing page and the docs: top bar, content, and footer.
 *
 * @param props.children - Page content.
 */
export function SiteShell(props: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteBar />
      <main className="flex flex-1 flex-col">{props.children}</main>
      <SiteFooterLinks />
    </div>
  )
}
