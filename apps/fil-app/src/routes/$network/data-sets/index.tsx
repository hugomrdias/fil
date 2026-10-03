import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { dataSetColumns } from '@/components/columns'
import { DataTable } from '@/components/data-table'
import {
  AddressFilter,
  BOOL_OPTIONS,
  FilterBar,
  IdFilter,
  SelectFilter,
} from '@/components/filters'
import { PageHeader } from '@/components/page-header'
import { dataSetsInfinite } from '@/lib/api/queries'
import { zAddress, zBool, zId } from '@/lib/search-schemas'

export const Route = createFileRoute('/$network/data-sets/')({
  validateSearch: z.object({
    owner: zAddress,
    provider_id: zId,
    deleted: zBool,
    with_cdn: zBool,
  }),
  component: DataSetsPage,
})

/** Paginated, filterable list of data sets. */
function DataSetsPage() {
  const { network } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const query = useInfiniteQuery(dataSetsInfinite(network, search))
  const columns = useMemo(() => dataSetColumns(network), [network])
  const update = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="PDP data sets managed by Filecoin Warm Storage."
        title="Data sets"
      />
      <FilterBar
        active={Object.values(search).some((v) => v !== undefined)}
        onClear={() => navigate({ search: {}, replace: true })}
      >
        <AddressFilter
          label="Owner"
          onChange={(owner) => update({ owner })}
          value={search.owner}
        />
        <IdFilter
          label="Provider id"
          onChange={(provider_id) => update({ provider_id })}
          value={search.provider_id}
        />
        <SelectFilter
          label="Deleted"
          onChange={(deleted) => update({ deleted })}
          options={BOOL_OPTIONS}
          value={search.deleted}
        />
        <SelectFilter
          label="CDN"
          onChange={(with_cdn) => update({ with_cdn })}
          options={BOOL_OPTIONS}
          value={search.with_cdn}
        />
      </FilterBar>
      <DataTable
        columns={columns}
        empty={query.error ? query.error.message : 'No data sets found.'}
        query={query}
      />
    </div>
  )
}
