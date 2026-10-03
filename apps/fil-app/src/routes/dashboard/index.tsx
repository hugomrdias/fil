import { useERC20Balance, useOperatorApprovals } from '@filoz/synapse-react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CheckCircle2Icon, CircleIcon } from 'lucide-react'
import { useBalance } from 'wagmi'
import { useDashboard } from '@/components/dashboard-context'
import { PageHeader, StatCard } from '@/components/page-header'
import { amountOrPending, TokenAmount } from '@/components/token-amount'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAccountSummary, useStorageSize } from '@/hooks-synapse'
import { formatBytes, formatEpochs, formatUnitsDisplay } from '@/lib/format'

export const Route = createFileRoute('/dashboard/')({
  component: Overview,
})

/** Dashboard overview: balances, Pay account health and setup checklist. */
function Overview() {
  const { address, chainId, network, storedKeys, sessionKey } = useDashboard()
  const fil = useBalance({ address, chainId })
  const usdfc = useERC20Balance({ address })
  const summary = useAccountSummary({ address })
  const approval = useOperatorApprovals({ address })
  const storage = useStorageSize({ address })
  const s = summary.data
  const amount = amountOrPending(network)

  const steps = [
    {
      done: (usdfc.data?.value ?? 0n) > 0n || (s?.funds ?? 0n) > 0n,
      title: 'Get USDFC',
      description:
        network === 'calibration'
          ? 'Use the faucet on the Pay account page.'
          : 'Bridge or mint USDFC into your wallet.',
      to: '/dashboard/account' as const,
    },
    {
      done: (s?.funds ?? 0n) > 0n,
      title: 'Deposit into Filecoin Pay',
      description: 'Storage is paid from your Pay account balance.',
      to: '/dashboard/account' as const,
    },
    {
      done: approval.data?.isApproved ?? false,
      title: 'Approve Warm Storage',
      description: 'Let FWSS create payment rails for your data sets.',
      to: '/dashboard/approvals' as const,
    },
    {
      done: Boolean(sessionKey) || storedKeys.length > 0,
      title: 'Create a session key (optional)',
      description: 'Sign uploads without wallet prompts.',
      to: '/dashboard/session-keys' as const,
    },
    {
      done: (storage.data?.datasetCount ?? 0) > 0,
      title: 'Create a data set and upload',
      description: 'Pick a provider and store your first files.',
      to: '/dashboard/upload' as const,
    },
  ]

  return (
    <>
      <PageHeader
        description="Your Filecoin Onchain Cloud storage and payments."
        title="Overview"
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hint="Wallet balance"
          label="FIL"
          value={fil.data ? formatUnitsDisplay(fil.data.value, 18, 4) : '…'}
        />
        <StatCard
          hint="Wallet balance"
          label="USDFC"
          value={
            usdfc.data
              ? formatUnitsDisplay(usdfc.data.value, usdfc.data.decimals, 4)
              : '…'
          }
        />
        <StatCard
          hint={
            s ? (
              <>
                Available{' '}
                <TokenAmount network={network} value={s.availableFunds} />
              </>
            ) : undefined
          }
          label="Pay account funds"
          value={amount(s?.funds)}
        />
        <StatCard
          hint={
            s
              ? s.lockupRatePerEpoch > 0n
                ? `Runway ${formatEpochs(s.runwayInEpochs)}`
                : 'No active storage payments'
              : undefined
          }
          label="Spend rate"
          value={amount(s?.lockupRatePerMonth, '/month')}
        />
        <StatCard
          hint={`${storage.data?.datasetCount ?? '…'} live data sets`}
          label="Stored"
          value={storage.data ? formatBytes(storage.data.totalSizeBytes) : '…'}
        />
        <StatCard
          hint={
            approval.data?.isApproved
              ? 'FWSS can create rails'
              : 'Approve FWSS to store data'
          }
          label="Warm Storage approval"
          value={
            approval.isPending
              ? '…'
              : approval.data?.isApproved
                ? 'Approved'
                : 'Not approved'
          }
        />
        <StatCard
          hint={s && s.debt > 0n ? 'Deposit to cover debt' : 'Locked for rails'}
          label={s && s.debt > 0n ? 'Debt' : 'Total lockup'}
          value={amount(s && (s.debt > 0n ? s.debt : s.totalLockup))}
        />
        <StatCard
          hint={
            storedKeys.length > 0
              ? `${storedKeys.length} stored in this browser`
              : 'None yet'
          }
          label="Session key"
          value={sessionKey ? 'Active' : 'Wallet signing'}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>
            Chain {chainId} · steps to store data on Filecoin Onchain Cloud.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col divide-y">
            {steps.map((step) => (
              <li className="flex items-center gap-3 py-3" key={step.title}>
                {step.done ? (
                  <CheckCircle2Icon className="size-5 text-success" />
                ) : (
                  <CircleIcon className="size-5 text-muted-foreground" />
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    className="text-sm font-medium hover:underline"
                    to={step.to}
                  >
                    {step.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {step.description}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  )
}
