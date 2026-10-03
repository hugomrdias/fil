import { SchedulePieceRemovalsPermission } from '@filoz/synapse-core/session-key'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ExternalLinkIcon, TrashIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { isAddressEqual } from 'viem'
import { pieceColumns, RailLink } from '@/components/columns'
import { useDashboard } from '@/components/dashboard-context'
import {
  PdpDataSetStatus,
  TerminateDataSetButton,
} from '@/components/data-set-actions'
import { type Column, columnHelper, DataTable } from '@/components/data-table'
import { Details, MetadataView } from '@/components/details'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { SignerBadge } from '@/components/signer-badge'
import { FlagBadge } from '@/components/status-badge'
import { txToasts } from '@/components/tx-toast'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { UploadPanel } from '@/components/upload-panel'
import { useDeletePieces, usePdpDataSet } from '@/hooks-synapse'
import type { Piece } from '@/lib/api/client'
import { apiKey, dataSetPiecesInfinite } from '@/lib/api/queries'
import { assertId, useFlatPages } from '@/lib/route-helpers'

export const Route = createFileRoute('/dashboard/data-sets/$id')({
  beforeLoad: ({ params }) => assertId(params.id),
  component: MyDataSetPage,
})

/** Manage one data set: pieces, batch delete, upload and terminate. */
function MyDataSetPage() {
  const { id } = Route.useParams()
  const { address, network, signerFor } = useDashboard()
  const queryClient = useQueryClient()
  const dataSet = usePdpDataSet({ dataSetId: BigInt(id) })
  const pieces = useInfiniteQuery({
    ...dataSetPiecesInfinite(network, id, 'false'),
    refetchInterval: 30_000,
  })
  const rows = useFlatPages(pieces.data)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const remove = useDeletePieces({
    sessionKey: signerFor([SchedulePieceRemovalsPermission]),
    ...txToasts(network, 'Delete pieces', {
      successTitle: () => 'Removal scheduled for the next proving period',
      onSuccess: () => setSelected(new Set()),
    }),
  })

  const baseColumns = useMemo(
    () => [
      ...pieceColumns(network).filter(
        (col) => !('accessorKey' in col && col.accessorKey === 'removed')
      ),
      columnHelper<Piece>().accessor('metadata', {
        header: 'Metadata',
        cell: (info) => <MetadataView metadata={info.getValue()} />,
      }),
    ],
    [network]
  )
  const columns = useMemo<Column<Piece>[]>(
    () => [
      columnHelper<Piece>().display({
        id: 'select',
        header: () => (
          <Checkbox
            aria-label="Select all"
            checked={rows.length > 0 && selected.size === rows.length}
            onCheckedChange={(checked) =>
              setSelected(
                checked ? new Set(rows.map((row) => row.pieceId)) : new Set()
              )
            }
          />
        ),
        cell: (info) => (
          <Checkbox
            aria-label={`Select piece ${info.row.original.pieceId}`}
            checked={selected.has(info.row.original.pieceId)}
            onCheckedChange={(checked) =>
              setSelected((prev) => {
                const next = new Set(prev)
                if (checked) {
                  next.add(info.row.original.pieceId)
                } else {
                  next.delete(info.row.original.pieceId)
                }
                return next
              })
            }
          />
        ),
      }),
      ...baseColumns,
    ],
    [baseColumns, rows, selected]
  )

  if (dataSet.isPending) {
    return <Skeleton className="h-64" />
  }
  const d = dataSet.data
  if (!d) {
    return (
      <EmptyState
        description={
          dataSet.error?.message ??
          `Data set #${id} was not found on this network.`
        }
        title="Data set not found"
      />
    )
  }
  if (!isAddressEqual(d.payer, address)) {
    return (
      <EmptyState
        description="This data set belongs to another wallet."
        title="Not your data set"
      >
        <Button
          nativeButton={false}
          render={
            <Link params={{ network, id }} to="/$network/data-sets/$id" />
          }
          variant="outline"
        >
          View in explorer
        </Button>
      </EmptyState>
    )
  }

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button
              nativeButton={false}
              render={
                <Link params={{ network, id }} to="/$network/data-sets/$id" />
              }
              size="sm"
              variant="outline"
            >
              Explorer
              <ExternalLinkIcon />
            </Button>
            <TerminateDataSetButton dataSet={d} />
          </>
        }
        title={`Data set #${id}`}
      />
      <Details
        items={[
          { label: 'Status', value: <PdpDataSetStatus dataSet={d} /> },
          {
            label: 'Provider',
            value: d.provider
              ? `${d.provider.name} (#${d.providerId})`
              : `#${d.providerId} (unavailable)`,
          },
          { label: 'CDN', value: <FlagBadge value={d.cdn} /> },
          {
            label: 'PDP rail',
            value: <RailLink id={d.pdpRailId.toString()} network={network} />,
          },
          {
            label: 'Client data set id',
            value: d.clientDataSetId.toString(),
          },
          {
            label: 'Has pieces',
            value: <FlagBadge value={d.hasActivePieces} />,
          },
          { label: 'Metadata', value: <MetadataView metadata={d.metadata} /> },
        ]}
      />
      {d.live && d.pdpEndEpoch === 0n ? (
        <Card>
          <CardHeader>
            <CardTitle>Upload</CardTitle>
            <CardDescription>
              Files are streamed to {d.provider?.name ?? 'the provider'} and
              added to this data set.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UploadPanel
              dataSet={d}
              onDone={() =>
                queryClient.invalidateQueries({
                  queryKey: apiKey(network, 'data-set-pieces', id),
                })
              }
            />
          </CardContent>
        </Card>
      ) : null}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Pieces</h2>
          <div className="flex items-center gap-3">
            <SignerBadge permissions={[SchedulePieceRemovalsPermission]} />
            <Button
              disabled={selected.size === 0 || remove.isPending}
              onClick={() =>
                remove.mutate({
                  dataSet: d,
                  pieceIds: [...selected].map((pieceId) => BigInt(pieceId)),
                })
              }
              size="sm"
              variant="destructive"
            >
              {remove.isPending ? <Spinner /> : <TrashIcon />}
              Delete {selected.size > 0 ? selected.size : ''}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Piece lists come from the indexer and can lag the chain by a few
          minutes.
        </p>
        <DataTable
          columns={columns}
          data={rows}
          empty="No pieces yet."
          getRowId={(row) => row.pieceId}
          query={pieces}
        />
      </section>
    </>
  )
}
