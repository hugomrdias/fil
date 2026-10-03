import { Link } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { Network } from '@/lib/networks'

/**
 * Titled list of recent records with a link to the full list.
 *
 * @param props.title - Section title.
 * @param props.to - Full list route.
 * @param props.network - Filecoin network.
 * @param props.loading - Show skeleton rows.
 * @param props.empty - Text when there are no rows.
 * @param props.children - {@link FeedRow} elements.
 */
export function Feed(props: {
  title: string
  to: '/$network/data-sets' | '/$network/rails' | '/$network/providers'
  network: Network
  loading: boolean
  empty: string
  children: ReactNode[]
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4 px-1">
        <h2 className="font-medium">{props.title}</h2>
        <Link
          className="group flex items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          params={{ network: props.network }}
          to={props.to}
        >
          View all
          <ChevronRightIcon className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      </div>
      <ul className="divide-y overflow-hidden rounded-3xl border bg-card">
        {props.loading
          ? Array.from({ length: 6 }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
              <li className="flex flex-col gap-2 px-5 py-3.5" key={index}>
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3.5 w-2/3" />
              </li>
            ))
          : props.children}
        {!props.loading && props.children.length === 0 ? (
          <li className="px-5 py-10 text-center text-sm text-muted-foreground">
            {props.empty}
          </li>
        ) : null}
      </ul>
    </section>
  )
}

/**
 * One record in a {@link Feed}: identity and status on top, parties below,
 * amount and age on the right.
 *
 * @param props.title - Record link and status.
 * @param props.detail - Secondary line.
 * @param props.meta - Right-aligned value.
 * @param props.time - Right-aligned age.
 */
export function FeedRow(props: {
  title: ReactNode
  detail: ReactNode
  meta?: ReactNode
  time?: ReactNode
}) {
  return (
    <li className="flex items-start justify-between gap-4 px-5 py-3.5 text-sm">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2.5">{props.title}</div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-muted-foreground">
          {props.detail}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        {props.meta ? <span>{props.meta}</span> : null}
        {props.time ? (
          <span className="text-muted-foreground">{props.time}</span>
        ) : null}
      </div>
    </li>
  )
}
