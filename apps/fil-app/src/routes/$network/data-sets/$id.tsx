import { useInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { Address } from '@/components/address'
import {
  DataSetStatus,
  ProviderLink,
  pieceColumns,
  RailLink,
} from '@/components/columns'
import { DataTable } from '@/components/data-table'
import { Details, MetadataView } from '@/components/details'
import { BOOL_OPTIONS, FilterBar, SelectFilter } from '@/components/filters'
import { PageHeader } from '@/components/page-header'
import { FlagBadge } from '@/components/status-badge'
import { usePdpDataSet } from '@/hooks-synapse/use-pdp-data-sets'
import { dataSetPiecesInfinite, dataSetQuery } from '@/lib/api/queries'
import { CHAINS } from '@/lib/networks'
import { assertId, orNotFound } from '@/lib/route-helpers'
import { zBool } from '@/lib/search-schemas'

export const Route = createFileRoute('/$network/data-sets/$id')({
  validateSearch: z.object({ removed: zBool }),
  loader: ({ context, params }) => {
    assertId(params.id)
    return orNotFound(
      context.queryClient.ensureQueryData(
        dataSetQuery(params.network, params.id)
      )
    )
  },
  component: DataSetPage,
})

/** Data set detail: fields, payment rails, metadata and pieces. */
function DataSetPage() {
  const { network, id } = Route.useParams()
  const { removed } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: dataSet } = useSuspenseQuery(dataSetQuery(network, id))
  const onChain = usePdpDataSet({
    dataSetId: BigInt(id),
    chainId: CHAINS[network].id,
  })
  const pieces = useInfiniteQuery(dataSetPiecesInfinite(network, id, removed))
  const columns = useMemo(
    () =>
      pieceColumns(network, {
        providerId: dataSet.providerId,
        owner: dataSet.owner,
        cdn: dataSet.withCdn,
      }),
    [network, dataSet.providerId, dataSet.owner, dataSet.withCdn]
  )
  const chainData = onChain.data

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Warm Storage data set proven with PDP."
        status={<DataSetStatus dataSet={dataSet} />}
        title={`Data set #${id}`}
      />
      <Details
        items={[
          {
            label: 'Owner',
            value: <Address network={network} value={dataSet.owner} />,
          },
          {
            label: 'Provider',
            value: (
              <ProviderLink
                id={dataSet.providerId}
                name={chainData?.provider?.name}
                network={network}
              />
            ),
          },
          { label: 'CDN', value: <FlagBadge value={dataSet.withCdn} /> },
          {
            label: 'IPFS indexing',
            value: <FlagBadge value={dataSet.withIpfsIndexing} />,
          },
          {
            label: 'Live in PDP verifier',
            value: onChain.isPending ? (
              '…'
            ) : (
              <FlagBadge value={chainData?.live} />
            ),
          },
          {
            label: 'PDP rail',
            value: chainData?.pdpRailId ? (
              <RailLink id={chainData.pdpRailId.toString()} network={network} />
            ) : (
              '—'
            ),
          },
          {
            label: 'CDN rails',
            value:
              chainData?.cdnRailId && chainData.cdnRailId > 0n ? (
                <span className="flex gap-2">
                  <RailLink
                    id={chainData.cdnRailId.toString()}
                    network={network}
                  />
                  <RailLink
                    id={chainData.cacheMissRailId.toString()}
                    network={network}
                  />
                </span>
              ) : (
                '—'
              ),
          },
          {
            label: 'PDP end epoch',
            value:
              dataSet.pdpEndEpoch && dataSet.pdpEndEpoch !== '0'
                ? dataSet.pdpEndEpoch
                : '—',
          },
          { label: 'Source', value: dataSet.source ?? '—' },
          { label: 'Created at block', value: dataSet.createdAtBlock ?? '—' },
          { label: 'Updated at block', value: dataSet.updatedAtBlock ?? '—' },
        ]}
      />
      <Details
        items={[
          {
            label: 'Metadata',
            value: <MetadataView metadata={dataSet.metadata} />,
          },
        ]}
      />
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="px-1 font-medium">Pieces</h2>
          <FilterBar>
            <SelectFilter
              label="Removed"
              onChange={(value) =>
                navigate({ search: { removed: value }, replace: true })
              }
              options={BOOL_OPTIONS}
              value={removed}
            />
          </FilterBar>
        </div>
        <DataTable
          columns={columns}
          empty={pieces.error ? pieces.error.message : 'No pieces.'}
          query={pieces}
        />
      </section>
    </div>
  )
}
