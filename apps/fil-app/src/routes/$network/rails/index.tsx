import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { railColumns } from '@/components/columns'
import { DataTable } from '@/components/data-table'
import { AddressFilter, FilterBar, SelectFilter } from '@/components/filters'
import { PageHeader } from '@/components/page-header'
import { railsInfinite } from '@/lib/api/queries'
import { zAddress } from '@/lib/search-schemas'

const STATES = [
  { value: 'active' as const, label: 'Active' },
  { value: 'terminated' as const, label: 'Terminated' },
  { value: 'finalized' as const, label: 'Finalized' },
]

export const Route = createFileRoute('/$network/rails/')({
  validateSearch: z.object({
    payer: zAddress,
    payee: zAddress,
    operator: zAddress,
    state: z
      .enum(['active', 'terminated', 'finalized'])
      .optional()
      .catch(undefined),
  }),
  component: RailsPage,
})

/** Paginated, filterable list of Filecoin Pay rails. */
function RailsPage() {
  const { network } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const query = useInfiniteQuery(railsInfinite(network, search))
  const columns = useMemo(() => railColumns(network), [network])
  const update = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Filecoin Pay payment rails between payers and payees."
        title="Rails"
      />
      <FilterBar
        active={Object.values(search).some((v) => v !== undefined)}
        onClear={() => navigate({ search: {}, replace: true })}
      >
        <AddressFilter
          label="Payer"
          onChange={(payer) => update({ payer })}
          value={search.payer}
        />
        <AddressFilter
          label="Payee"
          onChange={(payee) => update({ payee })}
          value={search.payee}
        />
        <AddressFilter
          label="Operator"
          onChange={(operator) => update({ operator })}
          value={search.operator}
        />
        <SelectFilter
          label="State"
          onChange={(state) => update({ state })}
          options={STATES}
          value={search.state}
        />
      </FilterBar>
      <DataTable
        columns={columns}
        empty={query.error ? query.error.message : 'No rails found.'}
        query={query}
      />
    </div>
  )
}
