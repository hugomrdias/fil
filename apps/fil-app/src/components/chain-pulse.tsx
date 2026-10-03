import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { statusQuery } from '@/lib/api/queries'
import { epochAt } from '@/lib/format'
import { CHAINS, type Network } from '@/lib/networks'
import { cn } from '@/lib/utils'

/** Indexer lag, in epochs, still shown as in sync. */
const SYNCED_EPOCHS = 5

/**
 * Current chain epoch from the wall clock, updated at each epoch boundary.
 *
 * @param network - Filecoin network.
 * @returns The epoch and the seconds elapsed within it when it started.
 */
function useChainEpoch(network: Network) {
  const genesis = CHAINS[network].genesisTimestamp
  const [state, setState] = useState(() => epochAt(genesis, Date.now()))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const next = epochAt(genesis, Date.now())
      setState(next)
      timer = setTimeout(tick, (30 - next.elapsed) * 1000 + 50)
    }
    tick()
    return () => clearTimeout(timer)
  }, [genesis])
  return state
}

/**
 * Live chain heartbeat: the current Filecoin epoch with a bar that fills
 * over its 30 seconds, and how far behind the fil-api indexers are. The
 * bar is the page's one ambient motion; reduced motion shows it static.
 *
 * @param props.network - Filecoin network.
 * @param props.className - Extra classes.
 */
export function ChainPulse(props: { network: Network; className?: string }) {
  const { epoch, elapsed } = useChainEpoch(props.network)
  // Fix the phase once; the infinite animation then stays on the chain clock.
  const [delay] = useState(() => -elapsed)
  const status = useQuery(statusQuery(props.network))
  const indexed = status.data?.indexers
    .map((indexer) => indexer.latest?.blockNumber)
    .filter((block) => block !== undefined)
  const head = indexed?.length ? Math.min(...indexed) : undefined
  const behind = head === undefined ? undefined : Math.max(epoch - head, 0)

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-2 text-sm',
        props.className
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">Epoch</span>
        <span className="font-medium tabular-nums">
          {epoch.toLocaleString()}
        </span>
        <span
          aria-hidden
          className="relative h-1 w-16 overflow-hidden rounded-full bg-muted"
        >
          <span
            className="absolute inset-0 origin-left animate-epoch rounded-full bg-primary"
            style={{ animationDelay: `${delay}s` }}
          />
        </span>
      </div>
      <IndexerState behind={behind} error={status.isError} head={head} />
    </div>
  )
}

/**
 * Indexer lag line for {@link ChainPulse}.
 *
 * @param props.head - Lowest block indexed across fil-api indexers.
 * @param props.behind - Epochs between the chain head and `head`.
 * @param props.error - Whether the status request failed.
 */
function IndexerState(props: {
  head: number | undefined
  behind: number | undefined
  error: boolean
}) {
  if (props.error) {
    return <span className="text-destructive">Indexer status unavailable</span>
  }
  if (props.head === undefined || props.behind === undefined) {
    return <span className="text-muted-foreground">Checking indexer…</span>
  }
  const synced = props.behind <= SYNCED_EPOCHS
  return (
    <span className="flex items-center gap-2 text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          synced ? 'bg-success' : 'bg-warning'
        )}
      />
      {synced
        ? `Indexed to ${props.head.toLocaleString()}`
        : `Indexer ${props.behind.toLocaleString()} epochs behind`}
    </span>
  )
}
