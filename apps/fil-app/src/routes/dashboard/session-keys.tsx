import {
  DefaultFwssPermissions,
  type Permission,
} from '@filoz/synapse-core/session-key'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  CheckIcon,
  KeyRoundIcon,
  PlusIcon,
  ShieldOffIcon,
  TrashIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { sessionKeyColumns, sessionKeyEventColumns } from '@/components/columns'
import { CopyButton } from '@/components/copy-button'
import { useDashboard } from '@/components/dashboard-context'
import { type Column, columnHelper, DataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { txToasts } from '@/components/tx-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useSessionKeyExpirations,
  useSessionKeyLogin,
  useSessionKeyRevoke,
} from '@/hooks-synapse'
import type { SessionKey } from '@/lib/api/client'
import {
  apiKey,
  sessionKeyEventsInfinite,
  sessionKeysInfinite,
} from '@/lib/api/queries'
import { formatTimestamp, shortHex } from '@/lib/format'
import { permissionLabel } from '@/lib/permissions'
import { isPrivateKey, type StoredSessionKey } from '@/lib/session-key-store'

export const Route = createFileRoute('/dashboard/session-keys')({
  component: SessionKeysPage,
})

const ORIGIN = 'fil-app'

/**
 * Dialog to authorize a session key with FWSS permissions until an expiry.
 *
 * @param props.address - Session key address.
 * @param props.trigger - Trigger button label.
 */
function AuthorizeDialog(props: { address: Address; trigger: string }) {
  const { network } = useDashboard()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState('30')
  const [permissions, setPermissions] = useState<Permission[]>([
    ...DefaultFwssPermissions,
  ])
  const login = useSessionKeyLogin(
    txToasts(network, 'Authorize session key', {
      onSuccess: () => {
        setOpen(false)
        queryClient.invalidateQueries({
          queryKey: apiKey(network, 'session-keys'),
        })
      },
    })
  )
  const validDays =
    /^\d+$/.test(days) && Number(days) > 0 && Number(days) <= 365

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>
        {props.trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Authorize session key</DialogTitle>
          <DialogDescription>
            {shortHex(props.address)} may sign these Warm Storage operations for
            your wallet until it expires. It cannot move funds.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Permissions</FieldLabel>
            <div className="flex flex-col gap-2">
              {DefaultFwssPermissions.map((permission) => (
                <Field key={permission} orientation="horizontal">
                  <Checkbox
                    checked={permissions.includes(permission)}
                    id={`permission-${permission}`}
                    onCheckedChange={(checked) =>
                      setPermissions((prev) =>
                        checked
                          ? [...prev, permission]
                          : prev.filter((p) => p !== permission)
                      )
                    }
                  />
                  <FieldLabel htmlFor={`permission-${permission}`}>
                    {permissionLabel(permission)}
                  </FieldLabel>
                </Field>
              ))}
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="expiry-days">Expires in (days)</FieldLabel>
            <Input
              aria-invalid={!validDays}
              id="expiry-days"
              inputMode="numeric"
              onChange={(event) => setDays(event.target.value)}
              value={days}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={!validDays || permissions.length === 0 || login.isPending}
            onClick={() =>
              login.mutate({
                address: props.address,
                permissions,
                expiresAt: BigInt(
                  Math.floor(Date.now() / 1000) + Number(days) * 86_400
                ),
                origin: ORIGIN,
              })
            }
          >
            {login.isPending ? <Spinner /> : null}
            Authorize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Revoke all FWSS permissions of a session key.
 *
 * @param props.address - Session key address.
 */
function RevokeButton(props: { address: Address }) {
  const { network } = useDashboard()
  const queryClient = useQueryClient()
  const revoke = useSessionKeyRevoke(
    txToasts(network, 'Revoke session key', {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: apiKey(network, 'session-keys'),
        }),
    })
  )
  return (
    <Button
      disabled={revoke.isPending}
      onClick={() =>
        revoke.mutate({
          address: props.address,
          permissions: DefaultFwssPermissions,
          origin: ORIGIN,
        })
      }
      size="sm"
      variant="outline"
    >
      {revoke.isPending ? <Spinner /> : <ShieldOffIcon />}
      Revoke
    </Button>
  )
}

/**
 * One locally stored session key with live expirations.
 *
 * @param props.entry - Stored key.
 */
function LocalKeyCard(props: { entry: StoredSessionKey }) {
  const { address, activeKey, activeExpirations, setActiveKey, removeKey } =
    useDashboard()
  const isActive = activeKey?.address === props.entry.address
  // The active key is already watched by the dashboard; read the others.
  const query = useSessionKeyExpirations({
    address,
    sessionKeyAddress: isActive ? undefined : props.entry.address,
  })
  const expirations = isActive ? activeExpirations : query.data
  const pending = isActive ? activeExpirations === null : query.isPending
  const now = BigInt(Math.floor(Date.now() / 1000))
  const authorized = Object.values(expirations ?? {}).some(
    (expiry) => expiry > now
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          {props.entry.label || 'Session key'}
          {isActive ? (
            <StatusBadge tone="info">Active signer</StatusBadge>
          ) : null}
        </CardTitle>
        <CardDescription className="flex items-center gap-1 font-mono">
          {props.entry.address}
          <CopyButton value={props.entry.address} />
        </CardDescription>
        <CardAction className="flex gap-2">
          {isActive ? (
            <Button
              onClick={() => setActiveKey(null)}
              size="sm"
              variant="outline"
            >
              Use wallet
            </Button>
          ) : (
            <Button
              onClick={() => setActiveKey(props.entry.address)}
              size="sm"
              variant="outline"
            >
              <CheckIcon />
              Use for signing
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="grid gap-2 sm:grid-cols-2">
          {DefaultFwssPermissions.map((permission) => {
            const expiry = expirations?.[permission] ?? 0n
            return (
              <li
                className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                key={permission}
              >
                <span>{permissionLabel(permission)}</span>
                {pending ? (
                  <Spinner />
                ) : expiry > now ? (
                  <StatusBadge tone="success">
                    until {formatTimestamp(expiry)}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">Not authorized</StatusBadge>
                )}
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <AuthorizeDialog
            address={props.entry.address}
            trigger={authorized ? 'Extend' : 'Authorize'}
          />
          {authorized ? <RevokeButton address={props.entry.address} /> : null}
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(props.entry.privateKey)
              toast.success('Private key copied', {
                description:
                  'Store it somewhere safe; anyone with it can sign storage actions.',
              })
            }}
            size="sm"
            variant="ghost"
          >
            Export key
          </Button>
          <AlertDialog>
            <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>
              <TrashIcon />
              Forget
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Forget this session key?</AlertDialogTitle>
                <AlertDialogDescription>
                  Its private key is deleted from this browser and cannot be
                  recovered unless you exported it.
                  {authorized
                    ? ' It stays authorized on-chain until it expires or you revoke it.'
                    : null}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (isActive) {
                      setActiveKey(null)
                    }
                    removeKey(props.entry.address)
                  }}
                  variant="destructive"
                >
                  Forget
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}

/** Dialog to generate or import a session key into this browser. */
function AddKeyDialog() {
  const { addKey, setActiveKey } = useDashboard()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [imported, setImported] = useState('')
  const importValid = imported === '' || isPrivateKey(imported)

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        New session key
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New session key</DialogTitle>
          <DialogDescription>
            Generates a key in this browser. Leave the private key empty to
            generate one, or paste an existing key to import it.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="key-label">Label</FieldLabel>
            <Input
              id="key-label"
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Laptop uploads"
              value={label}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="key-import">Private key (optional)</FieldLabel>
            <Input
              aria-invalid={!importValid}
              autoComplete="off"
              id="key-import"
              onChange={(event) => setImported(event.target.value.trim())}
              placeholder="0x…"
              type="password"
              value={imported}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={!importValid}
            onClick={() => {
              const privateKey = (imported || generatePrivateKey()) as Hex
              const account = privateKeyToAccount(privateKey)
              addKey({
                address: account.address.toLowerCase() as Address,
                privateKey,
                label: label.trim(),
                createdAt: Date.now(),
              })
              setActiveKey(account.address)
              setOpen(false)
              setLabel('')
              setImported('')
              toast.success('Session key added', {
                description: 'Authorize it to let it sign storage actions.',
              })
            }}
          >
            {imported ? 'Import' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Session keys: local keys, on-chain authorizations and history. */
function SessionKeysPage() {
  const { address, network, storedKeys } = useDashboard()
  const identity = address.toLowerCase()
  const onChain = useInfiniteQuery(sessionKeysInfinite(network, { identity }))
  const [tab, setTab] = useState('authorizations')
  const history = useInfiniteQuery({
    ...sessionKeyEventsInfinite(network, { identity }),
    enabled: tab === 'history',
  })
  const onChainColumns = useMemo<Column<SessionKey>[]>(() => {
    const c = columnHelper<SessionKey>()
    return [
      ...sessionKeyColumns(network).filter(
        (col) => !('accessorKey' in col && col.accessorKey === 'identity')
      ),
      c.display({
        id: 'revoke',
        header: '',
        cell: (info) =>
          info.row.original.active ? (
            <RevokeButton address={info.row.original.signer as Address} />
          ) : null,
      }),
    ]
  }, [network])
  const historyColumns = useMemo(
    () => sessionKeyEventColumns(network),
    [network]
  )

  return (
    <>
      <PageHeader
        actions={<AddKeyDialog />}
        description="Session keys sign data set, upload and delete requests for your wallet without wallet prompts. They cannot move funds."
        title="Session keys"
      />
      <Alert>
        <TriangleAlertIcon />
        <AlertTitle>Keys are stored in this browser</AlertTitle>
        <AlertDescription>
          Session key private keys live in this browser's local storage. Use
          short expiries and revoke keys you no longer need.
        </AlertDescription>
      </Alert>
      {storedKeys.length === 0 ? (
        <EmptyState
          description="Generate a session key, authorize it, then pick it as the signer in your account menu."
          icon={<KeyRoundIcon />}
          title="No session keys in this browser"
        />
      ) : (
        <div className="grid gap-4">
          {storedKeys.map((entry) => (
            <LocalKeyCard entry={entry} key={entry.address} />
          ))}
        </div>
      )}
      <Tabs onValueChange={(value) => setTab(String(value))} value={tab}>
        <TabsList>
          <TabsTrigger value="authorizations">All authorizations</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="authorizations">
          <DataTable
            columns={onChainColumns}
            empty="No session keys authorized by this wallet."
            query={onChain}
          />
        </TabsContent>
        <TabsContent value="history">
          <DataTable
            columns={historyColumns}
            empty="No history."
            query={history}
          />
        </TabsContent>
      </Tabs>
    </>
  )
}
