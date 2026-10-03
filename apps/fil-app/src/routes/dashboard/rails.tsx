import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { MoreHorizontalIcon } from 'lucide-react'
import { useMemo } from 'react'
import { z } from 'zod'
import { railColumns } from '@/components/columns'
import { useDashboard } from '@/components/dashboard-context'
import { type Column, columnHelper, DataTable } from '@/components/data-table'
import { PageHeader } from '@/components/page-header'
import { txToasts } from '@/components/tx-toast'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useRefreshWhenIndexed } from '@/hooks/use-refresh-when-indexed'
import { useSettleRail, useSettleTerminatedRail } from '@/hooks-synapse'
import type { Rail } from '@/lib/api/client'
import { railsInfinite } from '@/lib/api/queries'

export const Route = createFileRoute('/dashboard/rails')({
  validateSearch: z.object({
    role: z.enum(['payer', 'payee']).optional().catch(undefined),
  }),
  component: MyRailsPage,
})

/**
 * Settle actions for one rail.
 *
 * @param props.rail - Rail row.
 * @param props.isPayer - Whether the wallet is the rail's payer.
 */
function RailActions(props: { rail: Rail; isPayer: boolean }) {
  const { network } = useDashboard()
  const refresh = useRefreshWhenIndexed(network)
  const settle = useSettleRail(
    txToasts(network, `Settle rail #${props.rail.railId}`, {
      onSuccess: refresh,
    })
  )
  const force = useSettleTerminatedRail(
    txToasts(network, `Settle terminated rail #${props.rail.railId}`, {
      onSuccess: refresh,
    })
  )
  const railId = BigInt(props.rail.railId)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for rail ${props.rail.railId}`}
            disabled={settle.isPending || force.isPending}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={props.rail.state === 'finalized'}
          onClick={() => settle.mutate({ railId })}
        >
          Settle now
        </DropdownMenuItem>
        {/* Filecoin Pay only lets the payer settle without validation. */}
        {props.isPayer ? (
          <DropdownMenuItem
            disabled={props.rail.state !== 'terminated'}
            onClick={() => force.mutate({ railId })}
          >
            Settle terminated without validation
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Rails the wallet pays or receives, with settle actions. */
function MyRailsPage() {
  const { address, network } = useDashboard()
  const { role = 'payer' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const filters =
    role === 'payer'
      ? { payer: address.toLowerCase() }
      : { payee: address.toLowerCase() }
  const rails = useInfiniteQuery(railsInfinite(network, filters))
  const columns = useMemo<Column<Rail>[]>(() => {
    const c = columnHelper<Rail>()
    return [
      ...railColumns(network),
      c.display({
        id: 'actions',
        header: '',
        cell: (info) => (
          <RailActions isPayer={role === 'payer'} rail={info.row.original} />
        ),
      }),
    ]
  }, [network, role])

  return (
    <>
      <PageHeader
        description="Filecoin Pay rails where you are the payer or payee. Settling moves streamed funds to the payee."
        title="Rails"
      />
      <Tabs
        onValueChange={(value) =>
          navigate({
            search: { role: value as 'payer' | 'payee' },
            replace: true,
          })
        }
        value={role}
      >
        <TabsList>
          <TabsTrigger value="payer">Paying</TabsTrigger>
          <TabsTrigger value="payee">Receiving</TabsTrigger>
        </TabsList>
        <TabsContent value={role}>
          <DataTable
            columns={columns}
            empty={rails.error ? rails.error.message : 'No rails.'}
            query={rails}
          />
        </TabsContent>
      </Tabs>
    </>
  )
}
