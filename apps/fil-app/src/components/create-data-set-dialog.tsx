import { CreateDataSetPermission } from '@filoz/synapse-core/session-key'
import { useProviders } from '@filoz/synapse-react'
import { PlusIcon, TrashIcon } from 'lucide-react'
import { useState } from 'react'
import { useDashboard } from '@/components/dashboard-context'
import { SignerBadge } from '@/components/signer-badge'
import { txToasts } from '@/components/tx-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { useCreateDataSet } from '@/hooks-synapse'
import { formatBytes } from '@/lib/format'

/**
 * Dialog to create a Warm Storage data set: provider, CDN and metadata.
 *
 * @param props.onCreated - Called with the new data set id.
 */
export function CreateDataSetDialog(props: {
  onCreated?: (dataSetId: bigint) => void
}) {
  const { network, signerFor } = useDashboard()
  const [open, setOpen] = useState(false)
  const [providerId, setProviderId] = useState<string | null>(null)
  const [cdn, setCdn] = useState(false)
  const [metadata, setMetadata] = useState<{ key: string; value: string }[]>([])
  const providers = useProviders({ query: { enabled: open } })
  const create = useCreateDataSet({
    sessionKey: signerFor([CreateDataSetPermission]),
    ...txToasts<{ dataSetId: bigint }>(network, 'Create data set', {
      successTitle: (result) => `Data set #${result.dataSetId} created`,
      onSuccess: (result) => {
        setOpen(false)
        setMetadata([])
        props.onCreated?.(result.dataSetId)
      },
    }),
  })
  const list = providers.data ?? []
  const provider = list.find((p) => p.id.toString() === providerId)
  const items = list.map((p) => ({
    value: p.id.toString(),
    label: `${p.name} (#${p.id})`,
  }))

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        New data set
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New data set</DialogTitle>
          <DialogDescription>
            A data set groups pieces stored and proven by one provider.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Provider</FieldLabel>
            <Select
              items={items}
              onValueChange={(v) => setProviderId(v as string)}
              value={providerId}
            >
              <SelectTrigger aria-label="Provider" className="w-full">
                <SelectValue
                  placeholder={
                    providers.isPending
                      ? 'Loading providers…'
                      : 'Choose a provider'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {provider ? (
              <FieldDescription>
                {provider.pdp.location || 'Unknown location'} · pieces up to{' '}
                {formatBytes(provider.pdp.maxPieceSizeInBytes)}
              </FieldDescription>
            ) : null}
          </Field>
          <Field orientation="horizontal">
            <Switch checked={cdn} id="cdn" onCheckedChange={setCdn} />
            <FieldLabel htmlFor="cdn">Enable FilBeam CDN retrievals</FieldLabel>
          </Field>
          <Field>
            <FieldLabel>Metadata</FieldLabel>
            <div className="flex flex-col gap-2">
              {metadata.map((entry, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: editable rows without ids
                <div className="flex gap-2" key={index}>
                  <Input
                    aria-label="Metadata key"
                    onChange={(e) =>
                      setMetadata((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, key: e.target.value } : item
                        )
                      )
                    }
                    placeholder="key"
                    value={entry.key}
                  />
                  <Input
                    aria-label="Metadata value"
                    onChange={(e) =>
                      setMetadata((prev) =>
                        prev.map((item, i) =>
                          i === index
                            ? { ...item, value: e.target.value }
                            : item
                        )
                      )
                    }
                    placeholder="value"
                    value={entry.value}
                  />
                  <Button
                    aria-label="Remove metadata"
                    onClick={() =>
                      setMetadata((prev) => prev.filter((_, i) => i !== index))
                    }
                    size="icon"
                    variant="ghost"
                  >
                    <TrashIcon />
                  </Button>
                </div>
              ))}
              <Button
                className="self-start"
                onClick={() =>
                  setMetadata((prev) => [...prev, { key: '', value: '' }])
                }
                size="sm"
                variant="outline"
              >
                <PlusIcon />
                Add entry
              </Button>
            </div>
          </Field>
        </FieldGroup>
        <DialogFooter className="items-center sm:justify-between">
          <SignerBadge permissions={[CreateDataSetPermission]} />
          <Button
            disabled={!provider || create.isPending}
            onClick={() => {
              if (!provider) {
                return
              }
              const entries = metadata.filter((entry) => entry.key.trim())
              create.mutate({
                provider,
                cdn,
                metadata:
                  entries.length > 0
                    ? Object.fromEntries(
                        entries.map((entry) => [entry.key.trim(), entry.value])
                      )
                    : undefined,
              })
            }}
          >
            {create.isPending ? <Spinner /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
