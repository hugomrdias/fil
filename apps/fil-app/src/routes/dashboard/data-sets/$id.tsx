import { SchedulePieceRemovalsPermission } from '@filoz/synapse-core/session-key'
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
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
import { FlagBadge, StatusBadge } from '@/components/status-badge'
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
import {
  type UseUploadResult,
  useDeletePieces,
  usePdpDataSet,
} from '@/hooks-synapse'
import type { Piece } from '@/lib/api/client'
import { apiKey, dataSetPiecesInfinite } from '@/lib/api/queries'
import type { Network } from '@/lib/networks'
import { assertId, useFlatPages } from '@/lib/route-helpers'

export const Route = createFileRoute('/dashboard/data-sets/$id')({
  beforeLoad: ({ params }) => assertId(params.id),
  component: MyDataSetPage,
})

/**
 * Cache key for pieces this session added to a data set that the indexer
 * may not have caught up with yet. Kept outside the `fil-api` prefix so
 * refetches never clear it.
 *
 * @param network - Filecoin network.
 * @param dataSetId - Data set id.
 */
function recentPiecesKey(network: Network, dataSetId: string) {
  return ['fil-app', 'recent-pieces', network, dataSetId] as const
}

/**
 * Pieces confirmed by an upload, shaped like fil-api pieces with no
 * indexer fields yet.
 *
 * @param dataSetId - Data set id.
 * @param result - Upload result.
 */
function toRecentPieces(dataSetId: string, result: UseUploadResult): Piece[] {
  return result.pieces.flatMap((piece) =>
    piece.pieceId === undefined
      ? []
      : [
          {
            dataSetId,
            pieceId: piece.pieceId.toString(),
            cid: piece.pieceCid.toString(),
            rawSize: String(piece.size),
            metadata: piece.metadata,
            removed: false,
            addedAtBlock: null,
            removedAtBlock: null,
            updatedAtBlock: null,
          },
        ]
  )
}

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
  const indexed = useFlatPages(pieces.data)
  const recentKey = recentPiecesKey(network, id)
  const recent = useQuery({
    queryKey: recentKey,
    queryFn: (): Piece[] => [],
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  }).data
  // Uploaded pieces stay on top until the indexer returns them.
  const rows = useMemo(() => {
    const indexedIds = new Set(indexed.map((piece) => piece.pieceId))
    const pending = (recent ?? []).filter(
      (piece) => !indexedIds.has(piece.pieceId)
    )
    return pending.length > 0 ? [...pending, ...indexed] : indexed
  }, [indexed, recent])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const remove = useDeletePieces({
    sessionKey: signerFor([SchedulePieceRemovalsPermission]),
    ...txToasts(network, 'Delete pieces', {
      successTitle: () => 'Removal scheduled for the next proving period',
      onSuccess: () => setSelected(new Set()),
    }),
  })

  const d = dataSet.data
  const baseColumns = useMemo(
    () => [
      ...pieceColumns(network, {
        providerId: d?.providerId.toString() ?? null,
        owner: d?.payer,
        cdn: d?.cdn,
        serviceUrl: d?.provider?.pdp.serviceURL,
      }).filter(
        (col) =>
          !(
            'accessorKey' in col &&
            (col.accessorKey === 'removed' ||
              col.accessorKey === 'addedAtBlock')
          )
      ),
      columnHelper<Piece>().accessor('addedAtBlock', {
        header: 'Added at block',
        cell: (info) =>
          info.getValue() ?? <StatusBadge tone="info">Indexing</StatusBadge>,
      }),
      columnHelper<Piece>().accessor('metadata', {
        header: 'Metadata',
        cell: (info) => <MetadataView metadata={info.getValue()} />,
      }),
    ],
    [network, d]
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
              onDone={(result) => {
                queryClient.setQueryData<Piece[]>(recentKey, (prev = []) => [
                  ...toRecentPieces(id, result).reverse(),
                  ...prev,
                ])
                queryClient.invalidateQueries({
                  queryKey: apiKey(network, 'data-set-pieces', id),
                })
              }}
            />
          </CardContent>
        </Card>
      ) : null}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1 px-1">
            <h2 className="font-medium">Pieces</h2>
            <p className="text-sm text-muted-foreground">
              New uploads may take a moment to appear.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
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
        <DataTable
          columns={columns}
          data={rows}
          empty="No pieces yet."
          getRowId={(row) => row.pieceId}
          loading={pieces.isPending && rows.length === 0}
          query={pieces}
        />
      </section>
    </>
  )
}
