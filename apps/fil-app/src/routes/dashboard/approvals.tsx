import {
  useApproveOperator,
  useOperatorApprovals,
  usePriceList,
  useRevokeOperator,
} from '@filoz/synapse-react'
import { useForm } from '@tanstack/react-form'
import { createFileRoute } from '@tanstack/react-router'
import { ShieldCheckIcon, ShieldOffIcon } from 'lucide-react'
import { maxUint256 } from 'viem'
import { useDashboard } from '@/components/dashboard-context'
import { Details } from '@/components/details'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { amountOrPending, TokenAmount } from '@/components/token-amount'
import { txToasts } from '@/components/tx-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useSetOperatorApproval } from '@/hooks-synapse'
import {
  EPOCHS_PER_DAY,
  EPOCHS_PER_MONTH,
  formatEpochs,
  parseUnitsSafe,
} from '@/lib/format'
import { CHAINS } from '@/lib/networks'

export const Route = createFileRoute('/dashboard/approvals')({
  component: ApprovalsPage,
})

/**
 * Render an allowance, showing "Unlimited" for max values.
 *
 * @param props.value - Allowance in base units; `…` while loading.
 * @param props.suffix - Unit suffix.
 */
function Allowance(props: { value: bigint | undefined; suffix?: string }) {
  const { network } = useDashboard()
  if (props.value === undefined) {
    return '…'
  }
  if (props.value >= maxUint256 / 2n) {
    return <span>Unlimited</span>
  }
  return (
    <TokenAmount network={network} suffix={props.suffix} value={props.value} />
  )
}

/**
 * Per-epoch rate allowance for a monthly USDFC amount.
 *
 * @param perMonth - Decimal USDFC amount per month.
 * @returns Base units per epoch, or `undefined` when the input is invalid.
 */
function ratePerEpoch(perMonth: string) {
  const amount = parseUnitsSafe(perMonth)
  return amount === undefined ? undefined : amount / EPOCHS_PER_MONTH
}

/**
 * FWSS approval status badge.
 *
 * @param props.approval - Operator approvals query.
 */
function ApprovalStatus(props: {
  approval: ReturnType<typeof useOperatorApprovals>
}) {
  const { approval } = props
  if (approval.isPending) {
    return '…'
  }
  if (approval.error) {
    return <StatusBadge tone="danger">Unavailable</StatusBadge>
  }
  return approval.data.isApproved ? (
    <StatusBadge tone="success">Approved</StatusBadge>
  ) : (
    <StatusBadge tone="warning">Not approved</StatusBadge>
  )
}

/**
 * Approve or revoke FWSS. Renders nothing until the approval state loads,
 * so the unlimited approve never replaces custom allowances that just
 * haven't loaded yet.
 *
 * @param props.approved - Whether FWSS is approved; undefined while loading.
 */
function ApprovalAction(props: { approved: boolean | undefined }) {
  const { network } = useDashboard()
  const approve = useApproveOperator(txToasts(network, 'Approval'))
  const revoke = useRevokeOperator(txToasts(network, 'Revoke'))
  if (props.approved === undefined) {
    return null
  }
  if (!props.approved) {
    return (
      <Button disabled={approve.isPending} onClick={() => approve.mutate()}>
        {approve.isPending ? <Spinner /> : <ShieldCheckIcon />}
        Approve Warm Storage
      </Button>
    )
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button disabled={revoke.isPending} variant="destructive" />}
      >
        <ShieldOffIcon />
        Revoke
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke Warm Storage?</AlertDialogTitle>
          <AlertDialogDescription>
            FWSS will not be able to create new rails or increase existing ones.
            Existing rails keep running until they end.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => revoke.mutate()}
            variant="destructive"
          >
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Labelled text input bound to a TanStack Form field, with its errors.
 *
 * @param props.field - Form field.
 * @param props.label - Field label.
 * @param props.inputMode - Virtual keyboard hint.
 */
function TextField(props: {
  field: {
    name: string
    state: { value: string; meta: { errors: unknown[] } }
    handleChange: (value: string) => void
  }
  label: string
  inputMode: 'decimal' | 'numeric'
}) {
  const { field } = props
  return (
    <Field>
      <FieldLabel htmlFor={field.name}>{props.label}</FieldLabel>
      <Input
        id={field.name}
        inputMode={props.inputMode}
        onChange={(e) => field.handleChange(e.target.value)}
        value={field.state.value}
      />
      <FieldError>{field.state.meta.errors.join(', ')}</FieldError>
    </Field>
  )
}

/** FWSS operator approval management. */
function ApprovalsPage() {
  const { address, network } = useDashboard()
  const fwss = CHAINS[network].contracts.fwss.address
  const approval = useOperatorApprovals({ address })
  const prices = usePriceList()
  const custom = useSetOperatorApproval(txToasts(network, 'Custom approval'))
  const form = useForm({
    defaultValues: { ratePerMonth: '', lockup: '', maxLockupDays: '30' },
    onSubmit: async ({ value }) => {
      try {
        await custom.mutateAsync({
          approve: true,
          rateAllowance: ratePerEpoch(value.ratePerMonth) ?? 0n,
          lockupAllowance: parseUnitsSafe(value.lockup) ?? 0n,
          maxLockupPeriod: BigInt(value.maxLockupDays) * EPOCHS_PER_DAY,
        })
      } catch {
        // The mutation's onError already reports the failure.
      }
    },
  })
  const a = approval.data
  const amount = amountOrPending(network)
  const p = prices.data

  return (
    <>
      <PageHeader
        actions={<ApprovalAction approved={a?.isApproved} />}
        description="Filecoin Warm Storage Service (FWSS) creates and manages payment rails on your behalf within these allowances."
        title="Approvals"
      />
      <Details
        items={[
          {
            label: 'Status',
            value: <ApprovalStatus approval={approval} />,
          },
          {
            label: 'Operator',
            value: <span className="font-mono">{fwss}</span>,
          },
          {
            label: 'Rate allowance',
            value: <Allowance suffix="/epoch" value={a?.rateAllowance} />,
          },
          {
            label: 'Rate used',
            value: amount(a?.rateUsage, '/epoch'),
          },
          {
            label: 'Lockup allowance',
            value: <Allowance value={a?.lockupAllowance} />,
          },
          {
            label: 'Lockup used',
            value: amount(a?.lockupUsage),
          },
          {
            label: 'Max lockup period',
            value: a ? formatEpochs(a.maxLockupPeriod) : '…',
          },
        ]}
        title="Warm Storage operator"
      />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Custom allowances</CardTitle>
            <CardDescription>
              Cap how much FWSS may stream and lock instead of approving
              unlimited allowances.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                form.handleSubmit()
              }}
            >
              <FieldGroup>
                <form.Field
                  name="ratePerMonth"
                  validators={{
                    onChange: ({ value }) => {
                      const perEpoch = ratePerEpoch(value)
                      if (perEpoch === undefined) {
                        return 'Enter an amount'
                      }
                      if (perEpoch === 0n && parseUnitsSafe(value) !== 0n) {
                        return 'Amount is below the minimum rate per epoch'
                      }
                      return undefined
                    },
                  }}
                >
                  {(field) => (
                    <TextField
                      field={field}
                      inputMode="decimal"
                      label="Rate allowance (USDFC per month)"
                    />
                  )}
                </form.Field>
                <form.Field
                  name="lockup"
                  validators={{
                    onChange: ({ value }) =>
                      parseUnitsSafe(value) === undefined
                        ? 'Enter an amount'
                        : undefined,
                  }}
                >
                  {(field) => (
                    <TextField
                      field={field}
                      inputMode="decimal"
                      label="Lockup allowance (USDFC)"
                    />
                  )}
                </form.Field>
                <form.Field
                  name="maxLockupDays"
                  validators={{
                    onChange: ({ value }) =>
                      /^\d+$/.test(value) && BigInt(value) > 0n
                        ? undefined
                        : 'Enter a whole number of days above 0',
                  }}
                >
                  {(field) => (
                    <TextField
                      field={field}
                      inputMode="numeric"
                      label="Max lockup period (days)"
                    />
                  )}
                </form.Field>
              </FieldGroup>
              <form.Subscribe
                selector={(state) =>
                  [state.canSubmit, state.isSubmitting] as const
                }
              >
                {([canSubmit, isSubmitting]) => (
                  <Button disabled={!canSubmit || isSubmitting} type="submit">
                    {isSubmitting ? <Spinner /> : null}
                    Set allowances
                  </Button>
                )}
              </form.Subscribe>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Warm Storage pricing</CardTitle>
            <CardDescription>Current FWSS price list.</CardDescription>
          </CardHeader>
          <CardContent>
            {p ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt className="text-muted-foreground">Storage</dt>
                <dd>
                  <TokenAmount
                    network={network}
                    suffix="/TiB/month"
                    value={p.rates.storagePerTibPerMonth}
                  />
                </dd>
                <dt className="text-muted-foreground">Data set fee</dt>
                <dd>
                  <TokenAmount
                    network={network}
                    suffix="/month"
                    value={p.rates.datasetFeePerMonth}
                  />
                </dd>
                <dt className="text-muted-foreground">CDN egress</dt>
                <dd>
                  <TokenAmount
                    network={network}
                    suffix="/TiB"
                    value={p.rates.cdnEgressPerTib}
                  />
                </dd>
                <dt className="text-muted-foreground">Create data set fee</dt>
                <dd>
                  <TokenAmount
                    network={network}
                    value={p.fees.createDataSetFee}
                  />
                </dd>
                <dt className="text-muted-foreground">Default lockup</dt>
                <dd>{formatEpochs(p.lockups.defaultLockupPeriod)}</dd>
              </dl>
            ) : (
              <Spinner />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
