import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Address } from '@/components/address'
import { ChainPulse } from '@/components/chain-pulse'
import {
  DataSetLink,
  DataSetStatus,
  ProviderLink,
  providerColumns,
  RailLink,
} from '@/components/columns'
import { DataTable } from '@/components/data-table'
import { Feed, FeedRow } from '@/components/feed'
import { HeroSearch } from '@/components/hero-search'
import { RailStateBadge } from '@/components/status-badge'
import { TokenAmount } from '@/components/token-amount'
import {
  dataSetsInfinite,
  providersInfinite,
  railsInfinite,
} from '@/lib/api/queries'
import { epochToDate, formatRelative, ratePerDay } from '@/lib/format'
import { CHAINS, NETWORK_LABELS } from '@/lib/networks'
import { useFlatPages } from '@/lib/route-helpers'

export const Route = createFileRoute('/$network/')({
  component: ExplorerHome,
})

/** Explorer landing page: search, chain heartbeat and recent activity. */
function ExplorerHome() {
  const { network } = Route.useParams()
  const genesis = CHAINS[network].genesisTimestamp
  const dataSets = useInfiniteQuery(dataSetsInfinite(network, {}, 6))
  const rails = useInfiniteQuery(railsInfinite(network, {}, 6))
  const providers = useInfiniteQuery(
    providersInfinite(network, { approved: 'true' }, 10)
  )
  const providerCols = useMemo(() => providerColumns(network), [network])
  const dataSetRows = useFlatPages(dataSets.data)
  const railRows = useFlatPages(rails.data)
  const providerRows = useFlatPages(providers.data)

  return (
    <div className="flex flex-col gap-12 sm:gap-16">
      <section className="flex max-w-3xl flex-col gap-7 pt-4 sm:pt-12">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tighter text-balance sm:text-5xl">
            Search Filecoin
          </h1>
          <p className="max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
            Data sets, pieces, storage providers, payment rails and session keys
            on {NETWORK_LABELS[network]}.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <HeroSearch network={network} />
          <ChainPulse className="px-1" key={network} network={network} />
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-6">
        <Feed
          empty="No data sets yet."
          loading={dataSets.isPending}
          network={network}
          title="Latest data sets"
          to="/$network/data-sets"
        >
          {dataSetRows.map((dataSet) => (
            <FeedRow
              detail={
                <>
                  <ProviderLink id={dataSet.providerId} network={network} />
                  <ArrowRightIcon
                    aria-label="stores for"
                    className="size-3.5"
                  />
                  <Address network={network} noCopy value={dataSet.owner} />
                </>
              }
              key={dataSet.dataSetId}
              time={
                dataSet.createdAtBlock
                  ? formatRelative(epochToDate(dataSet.createdAtBlock, genesis))
                  : undefined
              }
              title={
                <>
                  <DataSetLink id={dataSet.dataSetId} network={network} />
                  <DataSetStatus dataSet={dataSet} />
                </>
              }
            />
          ))}
        </Feed>
        <Feed
          empty="No rails yet."
          loading={rails.isPending}
          network={network}
          title="Latest rails"
          to="/$network/rails"
        >
          {railRows.map((rail) => (
            <FeedRow
              detail={
                <>
                  <Address network={network} noCopy value={rail.payer} />
                  <ArrowRightIcon aria-label="pays" className="size-3.5" />
                  <Address network={network} noCopy value={rail.payee} />
                </>
              }
              key={rail.railId}
              meta={
                <TokenAmount
                  digits={2}
                  network={network}
                  suffix="/day"
                  token={rail.token}
                  value={ratePerDay(rail.paymentRate)}
                />
              }
              time={formatRelative(new Date(rail.createdAt * 1000))}
              title={
                <>
                  <RailLink id={rail.railId} network={network} />
                  <RailStateBadge state={rail.state} />
                </>
              }
            />
          ))}
        </Feed>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="px-1 font-medium">Approved providers</h2>
        <DataTable
          columns={providerCols}
          data={providerRows}
          loading={providers.isPending}
        />
      </section>
    </div>
  )
}
