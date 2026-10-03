import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { ExternalLinkIcon } from 'lucide-react'
import { useMemo } from 'react'
import { z } from 'zod'
import {
  dataSetColumns,
  pieceWithDataSetColumns,
  railColumns,
  sessionKeyColumns,
} from '@/components/columns'
import { CopyButton } from '@/components/copy-button'
import { DataTable } from '@/components/data-table'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  dataSetsInfinite,
  piecesInfinite,
  railsInfinite,
  sessionKeysInfinite,
} from '@/lib/api/queries'
import { addressUrl } from '@/lib/networks'

const TABS = [
  'data-sets',
  'payer',
  'payee',
  'operator',
  'pieces',
  'session-keys',
] as const

/** Address page tab. */
type Tab = (typeof TABS)[number]

export const Route = createFileRoute('/$network/address/$address')({
  params: {
    parse: (params) => ({ address: params.address.toLowerCase() }),
    stringify: (params) => ({ address: params.address }),
  },
  beforeLoad: ({ params }) => {
    if (!/^0x[0-9a-f]{40}$/.test(params.address)) {
      throw notFound()
    }
  },
  validateSearch: z.object({
    tab: z.enum(TABS).optional().catch(undefined),
  }),
  component: AddressPage,
})

/** Everything fil-api knows about an address, by role. */
function AddressPage() {
  const { network, address } = Route.useParams()
  const { tab = 'data-sets' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const is = (name: Tab) => tab === name

  const dataSets = useInfiniteQuery({
    ...dataSetsInfinite(network, { owner: address }),
    enabled: is('data-sets'),
  })
  const payer = useInfiniteQuery({
    ...railsInfinite(network, { payer: address }),
    enabled: is('payer'),
  })
  const payee = useInfiniteQuery({
    ...railsInfinite(network, { payee: address }),
    enabled: is('payee'),
  })
  const operator = useInfiniteQuery({
    ...railsInfinite(network, { operator: address }),
    enabled: is('operator'),
  })
  const pieces = useInfiniteQuery({
    ...piecesInfinite(network, { owner: address }),
    enabled: is('pieces'),
  })
  const sessionKeys = useInfiniteQuery({
    ...sessionKeysInfinite(network, { identity: address }),
    enabled: is('session-keys'),
  })

  const dataSetCols = useMemo(() => dataSetColumns(network), [network])
  const railCols = useMemo(() => railColumns(network), [network])
  const pieceCols = useMemo(() => pieceWithDataSetColumns(network), [network])
  const sessionKeyCols = useMemo(() => sessionKeyColumns(network), [network])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Button
            nativeButton={false}
            render={
              <a
                href={addressUrl(network, address)}
                rel="noreferrer"
                target="_blank"
              />
            }
            size="sm"
            variant="outline"
          >
            Block explorer
            <ExternalLinkIcon />
          </Button>
        }
        description="Data sets, rails, pieces and session keys for this address."
        title={
          <span className="flex items-center gap-1">
            <span className="truncate font-mono text-base sm:text-xl">
              {address}
            </span>
            <CopyButton value={address} />
          </span>
        }
      />
      <Tabs
        onValueChange={(value) =>
          navigate({ search: { tab: value as Tab }, replace: true })
        }
        value={tab}
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="data-sets">Data sets</TabsTrigger>
          <TabsTrigger value="payer">Rails as payer</TabsTrigger>
          <TabsTrigger value="payee">Rails as payee</TabsTrigger>
          <TabsTrigger value="operator">Rails as operator</TabsTrigger>
          <TabsTrigger value="pieces">Pieces</TabsTrigger>
          <TabsTrigger value="session-keys">Session keys</TabsTrigger>
        </TabsList>
        <TabsContent value="data-sets">
          <DataTable
            columns={dataSetCols}
            empty="No data sets owned by this address."
            query={dataSets}
          />
        </TabsContent>
        <TabsContent value="payer">
          <DataTable
            columns={railCols}
            empty="No rails paid by this address."
            query={payer}
          />
        </TabsContent>
        <TabsContent value="payee">
          <DataTable
            columns={railCols}
            empty="No rails paying this address."
            query={payee}
          />
        </TabsContent>
        <TabsContent value="operator">
          <DataTable
            columns={railCols}
            empty="No rails operated by this address."
            query={operator}
          />
        </TabsContent>
        <TabsContent value="pieces">
          <DataTable
            columns={pieceCols}
            empty="No pieces owned by this address."
            query={pieces}
          />
        </TabsContent>
        <TabsContent value="session-keys">
          <DataTable
            columns={sessionKeyCols}
            empty="No session keys authorized by this address."
            query={sessionKeys}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
