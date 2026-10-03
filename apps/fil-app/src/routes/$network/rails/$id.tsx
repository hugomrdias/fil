import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { InfoIcon } from 'lucide-react'
import { useMemo } from 'react'
import {
  BaseError,
  ContractFunctionRevertedError,
  isAddressEqual,
  zeroAddress,
} from 'viem'
import { Address } from '@/components/address'
import { settlementColumns } from '@/components/columns'
import { DataTable } from '@/components/data-table'
import { type DetailItem, Details } from '@/components/details'
import { ErrorState, NotFound } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { RailStateBadge } from '@/components/status-badge'
import { TokenAmount } from '@/components/token-amount'
import { TxLink } from '@/components/tx-link'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useRail } from '@/hooks-synapse/use-rail'
import { ApiError, type Rail } from '@/lib/api/client'
import { railQuery, settlementsInfinite } from '@/lib/api/queries'
import {
  epochToDate,
  formatBps,
  formatEpochs,
  formatTimestamp,
  ratePerDay,
  toBigInt,
} from '@/lib/format'
import { CHAINS, type Network } from '@/lib/networks'
import { assertId } from '@/lib/route-helpers'

export const Route = createFileRoute('/$network/rails/$id')({
  loader: async ({ context, params }) => {
    assertId(params.id)
    // A 404 may only mean the indexer is behind; the page then falls back
    // to the on-chain rail.
    await context.queryClient
      .ensureQueryData(railQuery(params.network, params.id))
      .catch((error: unknown) => {
        if (!ApiError.isNotFound(error)) {
          throw error
        }
      })
  },
  component: RailRoute,
})

/** Indexed rail page, or the on-chain fallback when not yet indexed. */
function RailRoute() {
  const { network, id } = Route.useParams()
  const indexed = useQuery(railQuery(network, id))
  if (indexed.data) {
    return <RailPage network={network} rail={indexed.data} />
  }
  if (indexed.isPending) {
    return <Skeleton className="h-64" />
  }
  if (ApiError.isNotFound(indexed.error)) {
    return <OnChainRail id={id} network={network} />
  }
  return <ErrorState error={indexed.error} reset={() => indexed.refetch()} />
}

/**
 * Whether an error is a contract revert.
 *
 * @param error - Error from a contract read.
 * @see https://viem.sh/docs/contract/readContract#error-handling
 */
function isRevert(error: Error) {
  return (
    error instanceof BaseError &&
    error.walk((cause) => cause instanceof ContractFunctionRevertedError) !==
      null
  )
}

/** Rail fields shared by the indexed and on-chain views. */
interface RailFields {
  payer: string
  payee: string
  operator: string
  validator: string
  token: string
  paymentRate: bigint | string
  lockupPeriod: bigint | string
  lockupFixed: bigint | string | null
  commissionRateBps: bigint | string
  settledUpTo: bigint | string | null
  endEpoch: bigint | string | null
}

/**
 * Detail rows common to both rail views.
 *
 * @param network - Filecoin network.
 * @param rail - Rail fields from fil-api or the chain.
 */
function railItems(network: Network, rail: RailFields): DetailItem[] {
  const genesis = CHAINS[network].genesisTimestamp
  const epoch = (value: bigint | string | null) =>
    value && toBigInt(value) > 0n
      ? `${value} (${epochToDate(value, genesis).toLocaleString()})`
      : '—'
  return [
    { label: 'Payer', value: <Address network={network} value={rail.payer} /> },
    { label: 'Payee', value: <Address network={network} value={rail.payee} /> },
    {
      label: 'Operator',
      value: <Address network={network} value={rail.operator} />,
    },
    {
      label: 'Validator',
      value: <Address network={network} value={rail.validator} />,
    },
    { label: 'Token', value: <Address network={network} value={rail.token} /> },
    {
      label: 'Payment rate',
      value: (
        <TokenAmount
          network={network}
          suffix="/day"
          token={rail.token}
          value={ratePerDay(rail.paymentRate)}
        />
      ),
    },
    { label: 'Lockup period', value: formatEpochs(rail.lockupPeriod) },
    {
      label: 'Fixed lockup',
      value: (
        <TokenAmount
          network={network}
          token={rail.token}
          value={rail.lockupFixed}
        />
      ),
    },
    { label: 'Commission', value: formatBps(rail.commissionRateBps) },
    { label: 'Settled up to', value: epoch(rail.settledUpTo) },
    { label: 'End epoch', value: epoch(rail.endEpoch) },
  ]
}

/**
 * Rail read directly from Filecoin Pay when fil-api has not indexed it yet.
 *
 * @param props.network - Filecoin network.
 * @param props.id - Rail id.
 */
function OnChainRail(props: { network: Network; id: string }) {
  const { network, id } = props
  const rail = useRail({
    railId: BigInt(id),
    chainId: CHAINS[network].id,
    query: { retry: false },
  })
  if (rail.isPending) {
    return <Skeleton className="h-64" />
  }
  // Filecoin Pay reverts for unknown rails; any other failure is an RPC
  // error worth retrying rather than a missing rail.
  if (rail.error && !isRevert(rail.error)) {
    return <ErrorState error={rail.error} reset={() => rail.refetch()} />
  }
  if (!rail.data || isAddressEqual(rail.data.from, zeroAddress)) {
    return <NotFound />
  }
  const r = rail.data
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Filecoin Pay payment rail."
        title={`Rail #${id}`}
      />
      <Alert>
        <InfoIcon />
        <AlertTitle>Not indexed yet</AlertTitle>
        <AlertDescription>
          Showing live on-chain state. Settlement history appears once the
          indexer catches up.
        </AlertDescription>
      </Alert>
      <Details
        items={railItems(network, {
          payer: r.from,
          payee: r.to,
          operator: r.operator,
          validator: r.validator,
          token: r.token,
          paymentRate: r.paymentRate,
          lockupPeriod: r.lockupPeriod,
          lockupFixed: r.lockupFixed,
          commissionRateBps: r.commissionRateBps,
          settledUpTo: r.settledUpTo,
          endEpoch: r.endEpoch,
        })}
      />
    </div>
  )
}

/**
 * Indexed rail detail with its settlements.
 *
 * @param props.network - Filecoin network.
 * @param props.rail - Indexed rail.
 */
function RailPage(props: { network: Network; rail: Rail }) {
  const { network, rail } = props
  const id = rail.railId
  const settlements = useInfiniteQuery(settlementsInfinite(network, id))
  const columns = useMemo(
    () => settlementColumns(network, rail.token),
    [network, rail.token]
  )
  const amount = (value: string | null) => (
    <TokenAmount network={network} token={rail.token} value={value} />
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Filecoin Pay payment rail."
        status={<RailStateBadge state={rail.state} />}
        title={`Rail #${id}`}
      />
      <Details
        items={[
          ...railItems(network, rail),
          { label: 'Total settled', value: amount(rail.totalSettledAmount) },
          {
            label: 'Net paid to payee',
            value: amount(rail.totalNetPayeeAmount),
          },
          {
            label: 'Service fee recipient',
            value: (
              <Address network={network} value={rail.serviceFeeRecipient} />
            ),
          },
          {
            label: 'Terminated by',
            value: <Address network={network} value={rail.terminatedBy} />,
          },
          { label: 'Created', value: formatTimestamp(rail.createdAt) },
          {
            label: 'Creation tx',
            value: <TxLink hash={rail.txHash} network={network} />,
          },
        ]}
      />
      <section className="flex flex-col gap-3">
        <h2 className="px-1 font-medium">Settlements</h2>
        <DataTable
          columns={columns}
          empty="No settlements yet."
          query={settlements}
        />
      </section>
    </div>
  )
}
