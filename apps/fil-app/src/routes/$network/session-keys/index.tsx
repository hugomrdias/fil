import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { z } from 'zod'
import { sessionKeyColumns, sessionKeyEventColumns } from '@/components/columns'
import { DataTable } from '@/components/data-table'
import {
  AddressFilter,
  BOOL_OPTIONS,
  FilterBar,
  SelectFilter,
} from '@/components/filters'
import { PageHeader } from '@/components/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  sessionKeyEventsInfinite,
  sessionKeysInfinite,
} from '@/lib/api/queries'
import { zAddress, zBool } from '@/lib/search-schemas'

export const Route = createFileRoute('/$network/session-keys/')({
  validateSearch: z.object({
    identity: zAddress,
    signer: zAddress,
    active: zBool,
    tab: z.enum(['keys', 'history']).optional().catch(undefined),
  }),
  component: SessionKeysPage,
})

/** Session key authorizations and their history. */
function SessionKeysPage() {
  const { network } = Route.useParams()
  const { tab = 'keys', ...search } = Route.useSearch()
  const navigate = Route.useNavigate()
  const keys = useInfiniteQuery({
    ...sessionKeysInfinite(network, search),
    enabled: tab === 'keys',
  })
  const history = useInfiniteQuery({
    ...sessionKeyEventsInfinite(network, {
      identity: search.identity,
      signer: search.signer,
    }),
    enabled: tab === 'history',
  })
  const keyColumns = useMemo(() => sessionKeyColumns(network), [network])
  const historyColumns = useMemo(
    () => sessionKeyEventColumns(network),
    [network]
  )
  const update = (patch: Record<string, string | undefined>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Signers authorized by wallets through the SessionKeyRegistry."
        title="Session keys"
      />
      <FilterBar
        active={Object.values(search).some((v) => v !== undefined)}
        onClear={() => navigate({ search: { tab }, replace: true })}
      >
        <AddressFilter
          label="Identity"
          onChange={(identity) => update({ identity })}
          value={search.identity}
        />
        <AddressFilter
          label="Signer"
          onChange={(signer) => update({ signer })}
          value={search.signer}
        />
        {tab === 'keys' ? (
          <SelectFilter
            label="Active"
            onChange={(active) => update({ active })}
            options={BOOL_OPTIONS}
            value={search.active}
          />
        ) : null}
      </FilterBar>
      <Tabs onValueChange={(value) => update({ tab: value })} value={tab}>
        <TabsList>
          <TabsTrigger value="keys">Authorizations</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="keys">
          <DataTable
            columns={keyColumns}
            empty={keys.error ? keys.error.message : 'No session keys found.'}
            query={keys}
          />
        </TabsContent>
        <TabsContent value="history">
          <DataTable
            columns={historyColumns}
            empty={history.error ? history.error.message : 'No events found.'}
            query={history}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
