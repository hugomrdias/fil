import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { providerColumns } from '@/components/columns'
import { DataTable } from '@/components/data-table'
import { BOOL_OPTIONS, FilterBar, SelectFilter } from '@/components/filters'
import { PageHeader } from '@/components/page-header'
import { providersInfinite } from '@/lib/api/queries'
import { zBool } from '@/lib/search-schemas'

export const Route = createFileRoute('/$network/providers/')({
  validateSearch: z.object({
    approved: zBool,
    active: zBool,
    endorsed: zBool,
  }),
  component: ProvidersPage,
})

/** Paginated, filterable list of storage providers. */
function ProvidersPage() {
  const { network } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const query = useInfiniteQuery(providersInfinite(network, search))
  const columns = useMemo(() => providerColumns(network), [network])
  const update = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="PDP storage providers registered in the ServiceProviderRegistry."
        title="Storage providers"
      />
      <FilterBar
        active={Object.values(search).some((v) => v !== undefined)}
        onClear={() => navigate({ search: {}, replace: true })}
      >
        <SelectFilter
          label="Approved"
          onChange={(approved) => update({ approved })}
          options={BOOL_OPTIONS}
          value={search.approved}
        />
        <SelectFilter
          label="Active"
          onChange={(active) => update({ active })}
          options={BOOL_OPTIONS}
          value={search.active}
        />
        <SelectFilter
          label="Endorsed"
          onChange={(endorsed) => update({ endorsed })}
          options={BOOL_OPTIONS}
          value={search.endorsed}
        />
      </FilterBar>
      <DataTable
        columns={columns}
        empty={query.error ? query.error.message : 'No providers found.'}
        query={query}
      />
    </div>
  )
}
