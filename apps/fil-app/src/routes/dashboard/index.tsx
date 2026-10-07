import { useERC20Balance, useOperatorApprovals } from '@filoz/synapse-react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CheckIcon, ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useBalance } from 'wagmi'
import { useDashboard } from '@/components/dashboard-context'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { amountOrPending } from '@/components/token-amount'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccountSummary, useStorageSize } from '@/hooks-synapse'
import { formatBytes, formatEpochs, formatUnitsDisplay } from '@/lib/format'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/dashboard/')({
  component: Overview,
})

/** Dashboard routes the overview links to. */
type DashboardPath =
  | '/dashboard/account'
  | '/dashboard/approvals'
  | '/dashboard/session-keys'
  | '/dashboard/upload'
  | '/dashboard/data-sets'

/**
 * Small text link in a card header.
 *
 * @param props.to - Target page.
 * @param props.children - Link text.
 */
function CardLink(props: { to: DashboardPath; children: ReactNode }) {
  return (
    <CardAction>
      <Button
        nativeButton={false}
        render={<Link to={props.to} />}
        size="sm"
        variant="ghost"
      >
        {props.children}
        <ChevronRightIcon data-icon="inline-end" />
      </Button>
    </CardAction>
  )
}

/**
 * Label and value on one line.
 *
 * @param props.label - Row label.
 * @param props.children - Value; a skeleton while undefined.
 */
function Row(props: { label: string; children: ReactNode | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0 truncate text-right font-medium tabular-nums">
        {props.children ?? <Skeleton className="ml-auto h-4 w-20" />}
      </dd>
    </div>
  )
}

/** Dashboard overview: Pay account health, wallet, storage and setup. */
function Overview() {
  const { address, chainId, network, storedKeys, sessionKey, activeKey } =
    useDashboard()
  const fil = useBalance({ address, chainId })
  const usdfc = useERC20Balance({ address })
  const summary = useAccountSummary({ address })
  const approval = useOperatorApprovals({ address })
  const storage = useStorageSize({ address })
  const s = summary.data
  const amount = amountOrPending(network)
  const inDebt = s !== undefined && s.debt > 0n

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
      title: 'Create a session key',
      description: 'Optional. Sign uploads without wallet prompts.',
      to: '/dashboard/session-keys' as const,
    },
    {
      done: (storage.data?.datasetCount ?? 0) > 0,
      title: 'Create a data set and upload',
      description: 'Pick a provider and store your first files.',
      to: '/dashboard/upload' as const,
    },
  ]
  const doneCount = steps.filter((step) => step.done).length
  const loaded = s !== undefined && approval.data !== undefined && storage.data

  return (
    <>
      <PageHeader
        description="Your Filecoin storage and payments."
        title="Overview"
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardDescription>
              {inDebt ? 'Pay account debt' : 'Available in your Pay account'}
            </CardDescription>
            <CardTitle
              className={cn(
                'text-4xl font-semibold tracking-tight tabular-nums',
                inDebt && 'text-destructive'
              )}
            >
              {s ? (
                formatUnitsDisplay(inDebt ? s.debt : s.availableFunds, 18, 4)
              ) : (
                <Skeleton className="inline-block h-9 w-40 align-middle" />
              )}
              <span className="ml-2 text-base font-normal text-muted-foreground">
                USDFC
              </span>
            </CardTitle>
            <CardLink to="/dashboard/account">
              {inDebt ? 'Deposit' : 'Manage'}
            </CardLink>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 divide-y sm:grid-cols-2 sm:divide-y-0">
              <div className="divide-y">
                <Row label="Deposited">{s && amount(s.funds)}</Row>
                <Row label="Locked for rails">{s && amount(s.totalLockup)}</Row>
              </div>
              <div className="divide-y">
                <Row label="Spend rate">
                  {s && amount(s.lockupRatePerMonth, '/month')}
                </Row>
                <Row label="Runway">
                  {s &&
                    (s.lockupRatePerEpoch > 0n
                      ? formatEpochs(s.runwayInEpochs)
                      : 'No active payments')}
                </Row>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wallet</CardTitle>
            <CardLink to="/dashboard/account">Add funds</CardLink>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label="FIL">
                {fil.data && formatUnitsDisplay(fil.data.value, 18, 4)}
              </Row>
              <Row label="USDFC">
                {usdfc.data &&
                  formatUnitsDisplay(usdfc.data.value, usdfc.data.decimals, 4)}
              </Row>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
            <CardLink to="/dashboard/data-sets">Data sets</CardLink>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label="Stored">
                {storage.data && formatBytes(storage.data.totalSizeBytes)}
              </Row>
              <Row label="Live data sets">{storage.data?.datasetCount}</Row>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Access</CardTitle>
            <CardLink to="/dashboard/approvals">Approvals</CardLink>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 divide-y sm:grid-cols-2 sm:divide-y-0">
              <Row label="Warm Storage">
                {approval.data &&
                  (approval.data.isApproved ? (
                    <StatusBadge tone="success">Approved</StatusBadge>
                  ) : (
                    <StatusBadge tone="warning">Not approved</StatusBadge>
                  ))}
              </Row>
              <Row label="Storage actions signed by">
                {activeKey ? activeKey.label || 'Session key' : 'Wallet'}
              </Row>
            </dl>
          </CardContent>
        </Card>
      </div>

      {loaded && doneCount < steps.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Get set up</CardTitle>
            <CardDescription>
              {doneCount} of {steps.length} done
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col">
              {steps.map((step, index) => (
                <li key={step.title}>
                  <Link
                    className="group flex items-center gap-4 rounded-2xl px-3 py-3 transition-colors duration-150 hover:bg-muted"
                    to={step.to}
                  >
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                        step.done
                          ? 'bg-primary text-primary-foreground'
                          : 'border text-muted-foreground'
                      )}
                    >
                      {step.done ? <CheckIcon className="size-4" /> : index + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          step.done && 'text-muted-foreground line-through'
                        )}
                      >
                        {step.title}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {step.description}
                      </span>
                    </span>
                    <ChevronRightIcon className="size-4 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}
