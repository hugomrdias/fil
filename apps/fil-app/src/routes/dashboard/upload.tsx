import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { CreateDataSetDialog } from '@/components/create-data-set-dialog'
import { useDashboard } from '@/components/dashboard-context'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { UploadPanel } from '@/components/upload-panel'
import { usePdpDataSets } from '@/hooks-synapse'
import { zId } from '@/lib/search-schemas'

export const Route = createFileRoute('/dashboard/upload')({
  validateSearch: z.object({ dataSet: zId }),
  component: UploadPage,
})

/** Upload files to one of the wallet's live data sets. */
function UploadPage() {
  const { address } = useDashboard()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const dataSets = usePdpDataSets({ address })
  const live = (dataSets.data ?? []).filter(
    (d) => d.live && d.pdpEndEpoch === 0n && d.provider
  )
  const choose = (dataSet: string) =>
    navigate({ search: { dataSet }, replace: true })
  const selected =
    live.find((d) => d.dataSetId.toString() === search.dataSet) ??
    (live.length === 1 ? live[0] : undefined)
  const items = live.map((d) => ({
    value: d.dataSetId.toString(),
    label: `#${d.dataSetId} · ${d.provider?.name}${d.cdn ? ' · CDN' : ''}`,
  }))

  return (
    <>
      <PageHeader
        actions={
          <CreateDataSetDialog onCreated={(id) => choose(id.toString())} />
        }
        description="Store files on Filecoin with proof of data possession."
        title="Upload"
      />
      {dataSets.isPending ? (
        <Skeleton className="h-40" />
      ) : live.length === 0 ? (
        <EmptyState
          description="Create a data set first, then upload files to it."
          title="No live data sets"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Files</CardTitle>
            <CardDescription>
              Choose the data set to add pieces to.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Data set</FieldLabel>
              <Select
                items={items}
                onValueChange={(value) => choose(value as string)}
                value={selected?.dataSetId.toString() ?? null}
              >
                <SelectTrigger aria-label="Data set" className="w-full sm:w-96">
                  <SelectValue placeholder="Choose a data set" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {selected ? (
              <UploadPanel
                dataSet={selected}
                key={selected.dataSetId.toString()}
              />
            ) : null}
          </CardContent>
        </Card>
      )}
    </>
  )
}
