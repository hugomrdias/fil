import { Command as CommandPrimitive } from 'cmdk'
import { SearchIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { SearchCommandItems } from '@/components/search-command'
import { CommandList } from '@/components/ui/command'
import type { Network } from '@/lib/networks'
import { cn } from '@/lib/utils'

/**
 * The homepage search: the command menu's results inline under a large
 * input, so arrow keys and Enter work the same as in ⌘K.
 *
 * @param props.network - Network to search.
 * @param props.className - Extra classes.
 * @see https://cmdk.paco.me
 */
export function HeroSearch(props: { network: Network; className?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const open = focused && query.trim() !== ''

  return (
    <CommandPrimitive
      className={cn('relative', props.className)}
      label="Search Filecoin Onchain Cloud"
      loop
    >
      <div
        className={cn(
          'flex h-14 items-center gap-3 rounded-4xl border bg-card px-5 shadow-xs transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30',
          open && 'border-ring'
        )}
      >
        <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
        <CommandPrimitive.Input
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setQuery('')
            }
          }}
          onValueChange={setQuery}
          placeholder="Address, PieceCID, data set, rail or provider id, provider name"
          ref={input}
          value={query}
        />
      </div>
      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-2 origin-top animate-in rounded-3xl bg-popover p-1 text-popover-foreground shadow-xl ring-1 ring-foreground/5 duration-150 ease-(--ease-out-strong) fade-in-0 zoom-in-[0.98] dark:ring-foreground/10">
          <CommandList
            className="max-h-80"
            // Keep focus in the input while clicking a result.
            onMouseDown={(event) => event.preventDefault()}
          >
            <SearchCommandItems
              loadProviders={focused}
              network={props.network}
              onDone={() => {
                setQuery('')
                input.current?.blur()
              }}
              query={query}
            />
          </CommandList>
        </div>
      ) : null}
    </CommandPrimitive>
  )
}
