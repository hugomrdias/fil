import { useInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Address } from '@/components/address'
import { dataSetColumns, pieceWithDataSetColumns } from '@/components/columns'
import { DataTable } from '@/components/data-table'
import { Details } from '@/components/details'
import { PageHeader } from '@/components/page-header'
import { FlagBadge } from '@/components/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  dataSetsInfinite,
  piecesInfinite,
  providerQuery,
} from '@/lib/api/queries'
import { assertId, orNotFound } from '@/lib/route-helpers'

export const Route = createFileRoute('/$network/providers/$id')({
  loader: ({ context, params }) => {
    assertId(params.id)
    return orNotFound(
      context.queryClient.ensureQueryData(
        providerQuery(params.network, params.id)
      )
    )
  },
  component: ProviderPage,
})

/** Provider detail with its data sets and pieces. */
function ProviderPage() {
  const { network, id } = Route.useParams()
  const { data: provider } = useSuspenseQuery(providerQuery(network, id))
  const dataSets = useInfiniteQuery(
    dataSetsInfinite(network, { provider_id: id })
  )
  const pieces = useInfiniteQuery(piecesInfinite(network, { provider_id: id }))
  const dataSetCols = useMemo(() => dataSetColumns(network), [network])
  const pieceCols = useMemo(() => pieceWithDataSetColumns(network), [network])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Storage provider in the ServiceProviderRegistry."
        title={provider.name ? `${provider.name} (#${id})` : `Provider #${id}`}
      />
      <Details
        items={[
          {
            label: 'Address',
            value: <Address network={network} value={provider.address} />,
          },
          {
            label: 'Service URL',
            value: provider.serviceUrl?.startsWith('http') ? (
              <a
                className="text-primary hover:underline"
                href={provider.serviceUrl}
                rel="noreferrer"
                target="_blank"
              >
                {provider.serviceUrl}
              </a>
            ) : (
              (provider.serviceUrl ?? '—')
            ),
          },
          { label: 'Active', value: <FlagBadge value={provider.active} /> },
          {
            label: 'PDP product active',
            value: <FlagBadge value={provider.pdpProductActive} />,
          },
          {
            label: 'Approved for Warm Storage',
            value: <FlagBadge value={provider.approved} />,
          },
          { label: 'Endorsed', value: <FlagBadge value={provider.endorsed} /> },
          {
            label: 'Registered at block',
            value: provider.createdAtBlock ?? '—',
          },
          { label: 'Updated at block', value: provider.updatedAtBlock ?? '—' },
        ]}
      />
      <Tabs defaultValue="data-sets">
        <TabsList>
          <TabsTrigger value="data-sets">Data sets</TabsTrigger>
          <TabsTrigger value="pieces">Pieces</TabsTrigger>
        </TabsList>
        <TabsContent value="data-sets">
          <DataTable
            columns={dataSetCols}
            empty="No data sets."
            query={dataSets}
          />
        </TabsContent>
        <TabsContent value="pieces">
          <DataTable columns={pieceCols} empty="No pieces." query={pieces} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
