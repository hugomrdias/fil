import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'
import { useMemo } from 'react'
import {
  dataSetColumns,
  providerColumns,
  railColumns,
} from '@/components/columns'
import { DataTable } from '@/components/data-table'
import { StatCard } from '@/components/page-header'
import { SearchBox } from '@/components/search-box'
import { Button } from '@/components/ui/button'
import {
  dataSetsInfinite,
  providersInfinite,
  railsInfinite,
  statusQuery,
} from '@/lib/api/queries'
import { formatRelative } from '@/lib/format'
import { NETWORK_LABELS, type Network } from '@/lib/networks'
import { useFlatPages } from '@/lib/route-helpers'

export const Route = createFileRoute('/$network/')({
  component: ExplorerHome,
})

/**
 * Section heading with a "View all" link.
 *
 * @param props.title - Section title.
 * @param props.to - Target list route.
 * @param props.network - Filecoin network.
 */
function Section(props: {
  title: string
  to: '/$network/data-sets' | '/$network/rails' | '/$network/providers'
  network: Network
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{props.title}</h2>
        <Button
          nativeButton={false}
          render={<Link params={{ network: props.network }} to={props.to} />}
          size="sm"
          variant="ghost"
        >
          View all
          <ArrowRightIcon />
        </Button>
      </div>
      {props.children}
    </section>
  )
}

/** Explorer landing page: search, indexer status and recent activity. */
function ExplorerHome() {
  const { network } = Route.useParams()
  const status = useQuery(statusQuery(network))
  const dataSets = useInfiniteQuery(dataSetsInfinite(network, {}, 10))
  const rails = useInfiniteQuery(railsInfinite(network, {}, 10))
  const providers = useInfiniteQuery(
    providersInfinite(network, { approved: 'true' }, 10)
  )
  const dataSetCols = useMemo(() => dataSetColumns(network), [network])
  const railCols = useMemo(() => railColumns(network), [network])
  const providerCols = useMemo(() => providerColumns(network), [network])
  const dataSetRows = useFlatPages(dataSets.data)
  const railRows = useFlatPages(rails.data)
  const providerRows = useFlatPages(providers.data)
  const indexers = status.data?.indexers ?? []

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-5 border bg-gradient-to-br from-brand-500/10 via-transparent to-transparent p-6 sm:p-10">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
            Filecoin Onchain Cloud · {NETWORK_LABELS[network]}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Explore storage and payments
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Browse PDP data sets, pieces and storage providers, Filecoin Pay
            rails and settlements, and session key authorizations.
          </p>
        </div>
        <SearchBox network={network} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          hint={status.data ? NETWORK_LABELS[network] : 'Loading…'}
          label="Chain id"
          value={status.data?.chainId ?? '—'}
        />
        {indexers.map((indexer) => (
          <StatCard
            hint={
              indexer.latest
                ? `Latest ${formatRelative(new Date(indexer.latest.timestamp * 1000))} · finalized ${indexer.finalized?.blockNumber ?? '—'}`
                : 'No checkpoint yet'
            }
            key={indexer.schema}
            label={`Indexer · ${indexer.schema}`}
            value={indexer.latest?.blockNumber.toLocaleString() ?? '—'}
          />
        ))}
      </section>

      <Section
        network={network}
        title="Recent data sets"
        to="/$network/data-sets"
      >
        <DataTable
          columns={dataSetCols}
          data={dataSetRows}
          loading={dataSets.isPending}
        />
      </Section>
      <Section network={network} title="Recent rails" to="/$network/rails">
        <DataTable
          columns={railCols}
          data={railRows}
          loading={rails.isPending}
        />
      </Section>
      <Section
        network={network}
        title="Approved providers"
        to="/$network/providers"
      >
        <DataTable
          columns={providerCols}
          data={providerRows}
          loading={providers.isPending}
        />
      </Section>
    </div>
  )
}
