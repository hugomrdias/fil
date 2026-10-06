import type { Expirations } from '@filoz/synapse-core/session-key'
import {
  useApproveOperator,
  useERC20Balance,
  useOperatorApprovals,
} from '@filoz/synapse-react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowLeftRightIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { formatUnits, isAddressEqual } from 'viem'
import { useSwitchChain } from 'wagmi'
import { AmountForm } from '@/components/amount-form'
import { CopyButton } from '@/components/copy-button'
import { useDashboard } from '@/components/dashboard-context'
import { NetworkDot } from '@/components/network-switcher'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { amountOrPending } from '@/components/token-amount'
import { txToasts } from '@/components/tx-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { SETUP_STATUS_DESCRIPTION } from '@/components/webmcp-tools'
import { useWebMcpTool } from '@/hooks/use-webmcp-tool'
import {
  useAccountSummary,
  useDepositWithPermit,
  useSessionKeyExpirations,
  useSessionKeyLogin,
} from '@/hooks-synapse'
import { formatTimestamp, formatUnitsDisplay } from '@/lib/format'
import { CHAINS, NETWORK_LABELS } from '@/lib/networks'
import { permissionLabel } from '@/lib/permissions'
import {
  DEFAULT_DAYS,
  DEFAULT_NAME,
  expiryFromDays,
  isValidDays,
  MAX_DAYS,
  MAX_NAME_LENGTH,
  requestedScopes,
  SCOPE_IDS,
  SCOPE_PERMISSIONS,
  type ScopeId,
  type SetupSearch,
  setupSearchSchema,
} from '@/lib/setup-request'

export const Route = createFileRoute('/dashboard/setup')({
  validateSearch: setupSearchSchema,
  component: SetupPage,
})

/** What each scope lets a session key do, shown under its checkbox. */
const SCOPE_HELP: Record<ScopeId, string> = {
  createDataSet: 'Create data sets paid by your wallet.',
  addPieces: 'Add pieces to your data sets.',
  schedulePieceRemovals: 'Remove pieces from your data sets.',
  terminateService:
    'End the storage service of your data sets. Few tools need this.',
}

/**
 * Per-scope authorization state of a session key.
 *
 * @param scopes - Scopes to check.
 * @param expirations - Expiries read from the registry.
 * @param now - Current Unix time in seconds.
 */
function scopeStatus(
  scopes: readonly ScopeId[],
  expirations: Partial<Expirations> | undefined,
  now: bigint
) {
  const granted: ScopeId[] = []
  let expiresAt: bigint | undefined
  for (const scope of scopes) {
    const expiry = expirations?.[SCOPE_PERMISSIONS[scope]] ?? 0n
    if (expiry > now) {
      granted.push(scope)
      if (expiresAt === undefined || expiry < expiresAt) expiresAt = expiry
    }
  }
  return { granted, expiresAt, complete: granted.length === scopes.length }
}

/**
 * Numbered step card.
 *
 * @param props.step - Step number.
 * @param props.title - Step title.
 * @param props.description - What the step does.
 * @param props.status - Badge on the right.
 * @param props.children - Step body.
 */
function Step(props: {
  step: number
  title: string
  description: ReactNode
  status: ReactNode
  children?: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs tabular-nums">
            {props.step}
          </span>
          {props.title}
        </CardTitle>
        <CardDescription>{props.description}</CardDescription>
        <CardAction>{props.status}</CardAction>
      </CardHeader>
      {props.children ? <CardContent>{props.children}</CardContent> : null}
    </Card>
  )
}

/**
 * Ask the user to switch the wallet to the network the request is for.
 *
 * @param props.network - Requested network.
 */
function SwitchNetwork(props: { network: keyof typeof CHAINS }) {
  const { network } = useDashboard()
  const { mutate: switchChain, isPending } = useSwitchChain()
  return (
    <Alert>
      <ArrowLeftRightIcon />
      <AlertTitle>
        This request is for {NETWORK_LABELS[props.network]}
      </AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        Your wallet is on {NETWORK_LABELS[network]}. Switch networks to review
        it.
        <Button
          disabled={isPending}
          onClick={() => switchChain({ chainId: CHAINS[props.network].id })}
          size="sm"
        >
          {isPending ? <Spinner /> : <NetworkDot network={props.network} />}
          Switch to {NETWORK_LABELS[props.network]}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/**
 * Review and authorize the requested session key. The form starts from the
 * link's values, and the user can change any of them before signing.
 *
 * @param props.search - Validated link values; `signer` is set.
 * @param props.expirations - Live expiries of the session key.
 */
function SessionKeyStep(props: {
  search: SetupSearch & { signer: `0x${string}` }
  expirations: ReturnType<typeof useSessionKeyExpirations>
}) {
  const { address, network } = useDashboard()
  const { search, expirations } = props
  const [name, setName] = useState(search.name ?? DEFAULT_NAME)
  const [scopes, setScopes] = useState<ScopeId[]>(
    requestedScopes(search.scopes)
  )
  const [days, setDays] = useState(search.days ?? String(DEFAULT_DAYS))
  const login = useSessionKeyLogin(txToasts(network, 'Authorize session key'))
  const isWallet = isAddressEqual(search.signer, address)
  const now = BigInt(Math.floor(Date.now() / 1000))
  const status = scopeStatus(scopes, expirations.data, now)
  const validName = name.trim().length > 0 && name.length <= MAX_NAME_LENGTH
  const canSubmit =
    !isWallet &&
    validName &&
    isValidDays(days) &&
    scopes.length > 0 &&
    !login.isPending

  return (
    <Step
      description="This key can sign storage operations for your wallet until it expires. It cannot move funds."
      status={
        expirations.isPending ? (
          <Spinner />
        ) : status.complete && status.expiresAt ? (
          <StatusBadge tone="success">
            Authorized until {formatTimestamp(status.expiresAt)}
          </StatusBadge>
        ) : status.granted.length > 0 ? (
          <StatusBadge tone="warning">Partly authorized</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Not authorized</StatusBadge>
        )
      }
      step={1}
      title="Authorize a session key"
    >
      <FieldGroup>
        <Field>
          <FieldLabel>Session key address</FieldLabel>
          <p className="flex items-center gap-1 font-mono text-sm break-all">
            {search.signer}
            <CopyButton value={search.signer} />
          </p>
          <FieldDescription>
            Check that it matches the address your tool printed, for example the
            link from <code>fil login</code>.
          </FieldDescription>
        </Field>
        {isWallet ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>This is your wallet address</AlertTitle>
            <AlertDescription>
              A session key must be a separate address.
            </AlertDescription>
          </Alert>
        ) : null}
        <Field>
          <FieldLabel htmlFor="setup-name">Name</FieldLabel>
          <Input
            aria-invalid={!validName}
            id="setup-name"
            maxLength={MAX_NAME_LENGTH}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <FieldDescription>
            Recorded on chain with the authorization, so you can recognise the
            key later.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Permissions</FieldLabel>
          <div className="flex flex-col gap-3">
            {SCOPE_IDS.map((scope) => {
              const expiry = expirations.data?.[SCOPE_PERMISSIONS[scope]] ?? 0n
              return (
                <Field key={scope} orientation="horizontal">
                  <Checkbox
                    checked={scopes.includes(scope)}
                    id={`setup-scope-${scope}`}
                    onCheckedChange={(checked) =>
                      setScopes((prev) =>
                        SCOPE_IDS.filter((id) =>
                          id === scope ? checked : prev.includes(id)
                        )
                      )
                    }
                  />
                  <div className="flex flex-col gap-0.5">
                    <FieldLabel htmlFor={`setup-scope-${scope}`}>
                      {permissionLabel(SCOPE_PERMISSIONS[scope])}
                      {expiry > now ? (
                        <StatusBadge tone="success">
                          until {formatTimestamp(expiry)}
                        </StatusBadge>
                      ) : null}
                    </FieldLabel>
                    <FieldDescription>{SCOPE_HELP[scope]}</FieldDescription>
                  </div>
                </Field>
              )
            })}
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="setup-days">Expires in (days)</FieldLabel>
          <Input
            aria-invalid={!isValidDays(days)}
            id="setup-days"
            inputMode="numeric"
            onChange={(event) => setDays(event.target.value)}
            value={days}
          />
          <FieldDescription>From 1 to {MAX_DAYS} days.</FieldDescription>
        </Field>
        <Button
          className="self-start"
          disabled={!canSubmit}
          onClick={() =>
            login.mutate({
              address: search.signer,
              permissions: scopes.map((scope) => SCOPE_PERMISSIONS[scope]),
              expiresAt: expiryFromDays(Number(days)),
              origin: name.trim(),
            })
          }
        >
          {login.isPending ? <Spinner /> : <ShieldCheckIcon />}
          {status.granted.length > 0 ? 'Authorize again' : 'Authorize'}
        </Button>
        {login.isSuccess ? (
          <p className="text-sm text-muted-foreground">
            Authorized. A waiting <code>fil login</code> finds the approval on
            chain within a few seconds; otherwise run <code>fil login</code>{' '}
            again.
          </p>
        ) : null}
      </FieldGroup>
    </Step>
  )
}

/**
 * Approve Warm Storage (FWSS) as a Filecoin Pay operator, which every upload
 * needs.
 *
 * @param props.step - Step number.
 * @param props.approval - Operator approval query.
 */
function ApprovalStep(props: {
  step: number
  approval: ReturnType<typeof useOperatorApprovals>
}) {
  const { network } = useDashboard()
  const approve = useApproveOperator(txToasts(network, 'Approval'))
  const approved = props.approval.data?.isApproved
  return (
    <Step
      description="Lets Warm Storage create and manage the payment rails for your data sets."
      status={
        props.approval.isPending ? (
          <Spinner />
        ) : approved ? (
          <StatusBadge tone="success">Approved</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Not approved</StatusBadge>
        )
      }
      step={props.step}
      title="Approve Warm Storage"
    >
      {approved === false ? (
        <Button disabled={approve.isPending} onClick={() => approve.mutate()}>
          {approve.isPending ? <Spinner /> : <ShieldCheckIcon />}
          Approve Warm Storage
        </Button>
      ) : null}
    </Step>
  )
}

/**
 * Deposit USDFC into Filecoin Pay, prefilled with the requested amount.
 *
 * @param props.step - Step number.
 * @param props.deposit - Requested decimal amount, if any.
 * @param props.summary - Pay account summary query.
 */
function DepositStep(props: {
  step: number
  deposit: string | undefined
  summary: ReturnType<typeof useAccountSummary>
}) {
  const { address, network } = useDashboard()
  const usdfc = useERC20Balance({ address })
  const deposit = useDepositWithPermit(txToasts(network, 'Deposit'))
  const amount = amountOrPending(network)
  return (
    <Step
      description={
        props.deposit
          ? `The request asks for ${props.deposit} USDFC to cover storage costs.`
          : 'Optional. Storage is paid from your Filecoin Pay balance.'
      }
      status={
        <StatusBadge tone="neutral">
          Available {amount(props.summary.data?.availableFunds)}
        </StatusBadge>
      }
      step={props.step}
      title="Deposit USDFC"
    >
      <AmountForm
        action="Deposit"
        defaultValue={props.deposit}
        description={
          usdfc.data
            ? `Wallet balance: ${formatUnitsDisplay(usdfc.data.value)} USDFC`
            : undefined
        }
        label="Amount"
        max={usdfc.data?.value}
        onSubmit={(value) => deposit.mutateAsync({ amount: value })}
        symbol="USDFC"
      />
    </Step>
  )
}

/**
 * Review page for a setup request from a deep link or an agent: authorize a
 * session key, approve Warm Storage, and deposit USDFC. Each step is its own
 * wallet transaction, so the user approves exactly what they accept.
 */
function SetupPage() {
  const { address, network } = useDashboard()
  const search = Route.useSearch()
  const signer = search.signer as `0x${string}` | undefined
  const wrongNetwork = search.network != null && search.network !== network
  const expirations = useSessionKeyExpirations({
    address,
    sessionKeyAddress: wrongNetwork ? undefined : signer,
  })
  const approval = useOperatorApprovals({ address })
  const summary = useAccountSummary({ address })

  useWebMcpTool({
    name: 'get_setup_status',
    description: SETUP_STATUS_DESCRIPTION,
    inputSchema: { type: 'object', properties: {} },
    execute: () => {
      const now = BigInt(Math.floor(Date.now() / 1000))
      const scopes = requestedScopes(search.scopes)
      const status = scopeStatus(scopes, expirations.data, now)
      return {
        walletConnected: true,
        wallet: address,
        network,
        requestedNetwork: search.network ?? network,
        wrongNetwork,
        sessionKey: signer
          ? {
              signer,
              requestedScopes: scopes,
              grantedScopes: status.granted,
              authorized: status.complete,
              expiresAt: status.expiresAt
                ? new Date(Number(status.expiresAt) * 1000).toISOString()
                : null,
            }
          : null,
        warmStorageApproved: approval.data?.isApproved ?? null,
        availableFunds: summary.data
          ? formatUnits(summary.data.availableFunds, 18)
          : null,
        requestedDeposit: search.deposit ?? null,
        nextStep:
          'The user approves each step on this page in their wallet. Agents cannot sign for them.',
      }
    },
    annotations: { readOnlyHint: true },
  })

  return (
    <>
      <PageHeader
        description="A tool or agent asked to set up your wallet. Review each step, change what you need, and approve it in your wallet."
        title="Review setup request"
      />
      {wrongNetwork && search.network ? (
        <SwitchNetwork network={search.network} />
      ) : (
        <>
          <Alert>
            <TriangleAlertIcon />
            <AlertTitle>Only approve requests you started</AlertTitle>
            <AlertDescription>
              Authorize a session key only if you created it yourself, for
              example with <code>fil login</code> on your own machine.
            </AlertDescription>
          </Alert>
          {signer ? (
            <SessionKeyStep
              expirations={expirations}
              // Start a fresh form when the link or an agent changes the request.
              key={`${signer}|${search.name}|${search.scopes}|${search.days}`}
              search={{ ...search, signer }}
            />
          ) : null}
          <ApprovalStep approval={approval} step={signer ? 2 : 1} />
          <DepositStep
            deposit={search.deposit}
            key={search.deposit}
            step={signer ? 3 : 2}
            summary={summary}
          />
        </>
      )}
    </>
  )
}
