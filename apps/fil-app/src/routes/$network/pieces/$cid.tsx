import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { pieceWithDataSetColumns } from '@/components/columns'
import { CopyButton } from '@/components/copy-button'
import { DataTable } from '@/components/data-table'
import { Details, MetadataView } from '@/components/details'
import { PageHeader } from '@/components/page-header'
import { piecesInfinite } from '@/lib/api/queries'
import { formatBytes } from '@/lib/format'
import { useFlatPages } from '@/lib/route-helpers'

export const Route = createFileRoute('/$network/pieces/$cid')({
  // Not awaited: the page renders its own pending state.
  loader: ({ context: { queryClient }, params: { network, cid } }) => {
    void queryClient.prefetchInfiniteQuery(piecesInfinite(network, { cid }))
  },
  component: PiecePage,
})

/** Every data set and provider holding a PieceCID. */
function PiecePage() {
  const { network, cid } = Route.useParams()
  const query = useInfiniteQuery(piecesInfinite(network, { cid }))
  const rows = useFlatPages(query.data)
  const columns = useMemo(() => pieceWithDataSetColumns(network), [network])
  const first = rows[0]
  const providers = new Set(rows.map((row) => row.providerId)).size

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Copies of this piece across Warm Storage data sets."
        title={
          <span className="flex items-center gap-1">
            <span className="truncate font-mono text-base">{cid}</span>
            <CopyButton value={cid} />
          </span>
        }
      />
      <Details
        items={[
          { label: 'Size', value: first ? formatBytes(first.rawSize) : '—' },
          { label: 'Data sets', value: query.isPending ? '…' : rows.length },
          { label: 'Providers', value: query.isPending ? '…' : providers },
          {
            label: 'Metadata',
            value: <MetadataView metadata={first?.metadata} />,
          },
        ]}
      />
      <DataTable
        columns={columns}
        data={rows}
        empty={
          query.error ? query.error.message : 'No data set holds this piece.'
        }
        query={query}
      />
    </div>
  )
}
