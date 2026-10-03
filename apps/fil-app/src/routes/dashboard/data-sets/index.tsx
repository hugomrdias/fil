import type { PdpDataSet } from '@filoz/synapse-core/warm-storage'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { DatabaseIcon } from 'lucide-react'
import { useMemo } from 'react'
import { CreateDataSetDialog } from '@/components/create-data-set-dialog'
import { useDashboard } from '@/components/dashboard-context'
import {
  PdpDataSetStatus,
  TerminateDataSetButton,
} from '@/components/data-set-actions'
import { type Column, columnHelper, DataTable } from '@/components/data-table'
import { MetadataView } from '@/components/details'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { FlagBadge } from '@/components/status-badge'
import { usePdpDataSets } from '@/hooks-synapse'

export const Route = createFileRoute('/dashboard/data-sets/')({
  component: MyDataSetsPage,
})

/** The connected wallet's data sets with create and terminate actions. */
function MyDataSetsPage() {
  const { address } = useDashboard()
  const navigate = useNavigate()
  const dataSets = usePdpDataSets({ address })
  const columns = useMemo<Column<PdpDataSet>[]>(() => {
    const c = columnHelper<PdpDataSet>()
    return c.columns([
      c.accessor('dataSetId', {
        header: 'Data set',
        cell: (info) => (
          <Link
            className="font-mono text-primary hover:underline"
            params={{ id: info.getValue().toString() }}
            to="/dashboard/data-sets/$id"
          >
            #{info.getValue().toString()}
          </Link>
        ),
      }),
      c.accessor('provider', {
        header: 'Provider',
        cell: (info) =>
          info.getValue()?.name ?? `#${info.row.original.providerId}`,
      }),
      c.display({
        id: 'status',
        header: 'Status',
        cell: (info) => <PdpDataSetStatus dataSet={info.row.original} />,
      }),
      c.accessor('cdn', {
        header: 'CDN',
        cell: (info) => <FlagBadge value={info.getValue()} />,
      }),
      c.accessor('hasActivePieces', {
        header: 'Has pieces',
        cell: (info) => <FlagBadge value={info.getValue()} />,
      }),
      c.accessor('metadata', {
        header: 'Metadata',
        cell: (info) => <MetadataView metadata={info.getValue()} />,
      }),
      c.display({
        id: 'actions',
        header: '',
        cell: (info) => <TerminateDataSetButton dataSet={info.row.original} />,
      }),
    ])
  }, [])
  const rows = useMemo(
    () => [...(dataSets.data ?? [])].reverse(),
    [dataSets.data]
  )

  return (
    <>
      <PageHeader
        actions={
          <CreateDataSetDialog
            onCreated={(id) =>
              navigate({
                to: '/dashboard/data-sets/$id',
                params: { id: id.toString() },
              })
            }
          />
        }
        description="Data sets you pay for through Warm Storage."
        title="Data sets"
      />
      {dataSets.data && dataSets.data.length === 0 ? (
        <EmptyState
          description="Create a data set with a storage provider, then upload files to it."
          icon={<DatabaseIcon />}
          title="No data sets yet"
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          empty={dataSets.error?.message}
          getRowId={(row) => row.dataSetId.toString()}
          loading={dataSets.isPending}
        />
      )}
    </>
  )
}
