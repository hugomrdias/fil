import {
  useAddUsdfc,
  useERC20Balance,
  useFundWallet,
  useWithdraw,
} from '@filoz/synapse-react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CoinsIcon, DropletIcon } from 'lucide-react'
import { toast } from 'sonner'
import { AmountForm } from '@/components/amount-form'
import { useDashboard } from '@/components/dashboard-context'
import { Details } from '@/components/details'
import { PageHeader } from '@/components/page-header'
import { amountOrPending } from '@/components/token-amount'
import { txToasts } from '@/components/tx-toast'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import {
  synapseKeys,
  useAccountSummary,
  useDepositWithPermit,
} from '@/hooks-synapse'
import { formatEpochs } from '@/lib/format'

export const Route = createFileRoute('/dashboard/account')({
  component: AccountPage,
})

/** Filecoin Pay account: summary, deposit, withdraw and faucet. */
function AccountPage() {
  const { address, network } = useDashboard()
  const usdfc = useERC20Balance({ address })
  const summary = useAccountSummary({ address })
  const deposit = useDepositWithPermit(txToasts(network, 'Deposit'))
  const queryClient = useQueryClient()
  // synapse-react's useWithdraw skips the account summary shown here.
  const withdraw = useWithdraw(
    txToasts(network, 'Withdrawal', {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: synapseKeys.accountSummary }),
    })
  )
  const fund = useFundWallet({
    mutation: {
      onSuccess: () =>
        toast.success('Faucet request sent', {
          description: 'tFIL and USDFC arrive within a few minutes.',
        }),
      onError: (error) =>
        toast.error('Faucet failed', { description: error.message }),
    },
  })
  const addUsdfc = useAddUsdfc({
    mutation: { onError: (error) => toast.error(error.message) },
  })
  const s = summary.data
  const amount = amountOrPending(network)

  return (
    <>
      <PageHeader
        actions={
          <>
            {network === 'calibration' ? (
              <Button
                disabled={fund.isPending}
                onClick={() => fund.mutate()}
                variant="outline"
              >
                {fund.isPending ? <Spinner /> : <DropletIcon />}
                Faucet
              </Button>
            ) : null}
            <Button
              disabled={addUsdfc.isPending}
              onClick={() => addUsdfc.mutate()}
              variant="outline"
            >
              <CoinsIcon />
              Add USDFC to wallet
            </Button>
          </>
        }
        description="Your Filecoin Pay balance funds storage payment rails."
        title="Pay account"
      />
      <Details
        items={[
          { label: 'Wallet USDFC', value: amount(usdfc.data?.value) },
          { label: 'Funds', value: amount(s?.funds) },
          { label: 'Available', value: amount(s?.availableFunds) },
          { label: 'Total lockup', value: amount(s?.totalLockup) },
          {
            label: 'Fixed / rate-based lockup',
            value: s ? (
              <span className="flex flex-wrap gap-1">
                {amount(s.totalFixedLockup)} / {amount(s.totalRateBasedLockup)}
              </span>
            ) : (
              '…'
            ),
          },
          {
            label: 'Spend rate',
            value: amount(s?.lockupRatePerMonth, '/month'),
          },
          {
            label: 'Runway',
            value: s
              ? s.lockupRatePerEpoch > 0n
                ? formatEpochs(s.runwayInEpochs)
                : '∞'
              : '…',
          },
          { label: 'Debt', value: amount(s?.debt) },
          { label: 'As of epoch', value: s?.epoch.toString() ?? '…' },
        ]}
        title="Summary"
      />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deposit</CardTitle>
            <CardDescription>
              Move USDFC from your wallet to Filecoin Pay.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AmountForm
              action="Deposit"
              label="Amount"
              max={usdfc.data?.value}
              onSubmit={(amount) => deposit.mutateAsync({ amount })}
              symbol="USDFC"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Withdraw</CardTitle>
            <CardDescription>
              Returns available (unlocked) funds to your wallet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AmountForm
              action="Withdraw"
              label="Amount"
              max={s?.availableFunds}
              onSubmit={(amount) => withdraw.mutateAsync({ amount })}
              symbol="USDFC"
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
