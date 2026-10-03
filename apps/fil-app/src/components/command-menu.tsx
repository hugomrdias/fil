import { SearchIcon } from 'lucide-react'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { SearchCommandItems } from '@/components/search-command'
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
} from '@/components/ui/command'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { useExplorerNetwork } from '@/hooks/use-explorer-network'
import { cn } from '@/lib/utils'

/** Open state of the global command menu. */
interface CommandMenuState {
  /** Whether the dialog is open. */
  open: boolean
  /** Open or close the dialog. */
  setOpen: (open: boolean) => void
}

const CommandMenuContext = createContext<CommandMenuState | null>(null)

/** Whether the platform uses ⌘ rather than Ctrl for shortcuts. */
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.userAgent)

/**
 * Whether a keyboard event comes from a field the user is typing in.
 *
 * @param target - Event target.
 */
function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/**
 * Global ⌘K / Ctrl+K command menu. Also opens on `/` outside text fields.
 * It opens without animation because it is used many times a day.
 *
 * @param props.children - App content.
 * @see https://ui.shadcn.com/docs/components/base/command
 */
export function CommandMenuProvider(props: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const network = useExplorerNetwork()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      } else if (event.key === '/' && !isTyping(event.target)) {
        event.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const value = useMemo(() => ({ open, setOpen }), [open])

  return (
    <CommandMenuContext.Provider value={value}>
      {props.children}
      <CommandDialog
        className="data-open:animate-none data-closed:animate-none sm:max-w-xl"
        description="Look up an address, PieceCID or id, or jump to a page."
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setQuery('')
          }
        }}
        open={open}
        title="Search"
      >
        <Command>
          <CommandInput
            onValueChange={setQuery}
            placeholder="Address, PieceCID, data set, rail or provider id, provider name or page"
            value={query}
          />
          <CommandList className="max-h-[min(60svh,26rem)]">
            <SearchCommandItems
              loadProviders={open}
              network={network}
              onDone={() => {
                setOpen(false)
                setQuery('')
              }}
              query={query}
            />
          </CommandList>
        </Command>
      </CommandDialog>
    </CommandMenuContext.Provider>
  )
}

/** Open state and setter of the global command menu. */
export function useCommandMenu() {
  const context = useContext(CommandMenuContext)
  if (!context) {
    throw new Error('useCommandMenu must be used within CommandMenuProvider')
  }
  return context
}

/** The platform's command menu shortcut as keycaps. */
export function CommandShortcutKeys() {
  return (
    <KbdGroup>
      <Kbd>{IS_MAC ? '⌘' : 'Ctrl'}</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  )
}

/**
 * Search field look-alike that opens the command menu. Collapses to an
 * icon button below `sm`.
 *
 * @param props.className - Extra classes.
 */
export function SearchTrigger(props: { className?: string }) {
  const { setOpen } = useCommandMenu()
  return (
    <button
      aria-label="Search"
      className={cn(
        'flex h-9 items-center gap-2 rounded-4xl text-sm text-muted-foreground transition-[background-color,color] duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 max-sm:size-9 max-sm:justify-center max-sm:hover:bg-muted sm:w-56 sm:border sm:bg-muted/40 sm:pr-1.5 sm:pl-3 sm:hover:bg-muted lg:w-72',
        props.className
      )}
      onClick={() => setOpen(true)}
      type="button"
    >
      <SearchIcon className="size-4 shrink-0" />
      <span className="hidden flex-1 truncate text-left sm:inline">
        Search…
      </span>
      <span className="hidden sm:inline-flex">
        <CommandShortcutKeys />
      </span>
    </button>
  )
}
