import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useBlockNumber } from 'wagmi'
import { statusQuery } from '@/lib/api/queries'
import { epochAt } from '@/lib/format'
import { CHAINS, type Network } from '@/lib/networks'
import { cn } from '@/lib/utils'

/** Indexer lag behind the chain head, in epochs, still shown as in sync. */
const SYNCED_EPOCHS = 5

/** Chain head poll interval: one Filecoin epoch. */
const HEAD_INTERVAL = 30_000

/**
 * Current chain epoch from the wall clock, updated at each epoch boundary.
 * It is undefined until the page hydrates, because the server's clock would
 * not match the browser's.
 *
 * @param network - Filecoin network.
 * @returns The epoch, and `delay`: the animation delay that puts the epoch
 *   bar in phase with the chain clock, fixed at the first tick.
 */
function useChainEpoch(network: Network) {
  const genesis = CHAINS[network].genesisTimestamp
  const [state, setState] = useState<{ epoch: number; delay: number }>()
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const next = epochAt(genesis, Date.now())
      setState((prev) => ({
        epoch: next.epoch,
        delay: prev?.delay ?? -next.elapsed,
      }))
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
 * Lag is measured against the RPC chain head, not the wall-clock epoch: the
 * head trails the clock by an epoch or two even when everything is healthy.
 *
 * @param props.network - Filecoin network.
 * @param props.className - Extra classes.
 */
export function ChainPulse(props: { network: Network; className?: string }) {
  const clock = useChainEpoch(props.network)
  const status = useQuery(statusQuery(props.network))
  const chainHead = useBlockNumber({
    chainId: CHAINS[props.network].id,
    query: { refetchInterval: HEAD_INTERVAL },
  })
  const blocks = status.data?.indexers
    .map((indexer) => indexer.latest?.blockNumber)
    .filter((block) => block !== undefined)
  const indexed = blocks?.length ? Math.min(...blocks) : undefined
  const behind =
    indexed === undefined || chainHead.data === undefined
      ? undefined
      : Math.max(Number(chainHead.data) - indexed, 0)

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
          {clock ? clock.epoch.toLocaleString() : '—'}
        </span>
        <span
          aria-hidden
          className="relative h-1 w-16 overflow-hidden rounded-full bg-muted"
        >
          {clock && (
            <span
              className="absolute inset-0 origin-left animate-epoch rounded-full bg-primary"
              style={{ animationDelay: `${clock.delay}s` }}
            />
          )}
        </span>
      </div>
      <IndexerState
        behind={behind}
        error={status.isError}
        headError={chainHead.isError}
        indexed={indexed}
      />
    </div>
  )
}

/**
 * Indexer lag line for {@link ChainPulse}.
 *
 * @param props.indexed - Lowest block indexed across fil-api indexers.
 * @param props.behind - Epochs between the chain head and `indexed`.
 * @param props.error - Whether the status request failed.
 * @param props.headError - Whether the chain head request failed.
 */
function IndexerState(props: {
  indexed: number | undefined
  behind: number | undefined
  error: boolean
  headError: boolean
}) {
  if (props.error) {
    return <span className="text-destructive">Indexer status unavailable</span>
  }
  if (props.indexed !== undefined && props.headError) {
    // Without the chain head there is no lag to judge; show progress only.
    return (
      <span className="text-muted-foreground">
        Indexed to {props.indexed.toLocaleString()}
      </span>
    )
  }
  if (props.indexed === undefined || props.behind === undefined) {
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
        ? `Indexed to ${props.indexed.toLocaleString()}`
        : `Indexer ${props.behind.toLocaleString()} epochs behind`}
    </span>
  )
}
