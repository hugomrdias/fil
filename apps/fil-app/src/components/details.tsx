import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** One label/value row in {@link Details}. */
export interface DetailItem {
  /** Field label. */
  label: string
  /** Field value. */
  value: ReactNode
}

/**
 * Card with a responsive label/value grid for record detail pages.
 *
 * @param props.title - Card title.
 * @param props.items - Fields to show.
 */
export function Details(props: { title?: string; items: DetailItem[] }) {
  return (
    <Card>
      {props.title ? (
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent>
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {props.items.map((item) => (
            <div className="flex min-w-0 flex-col gap-1" key={item.label}>
              <dt className="text-sm text-muted-foreground">{item.label}</dt>
              <dd className="min-w-0 truncate text-sm">{item.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

/**
 * Key/value view of fil-api or on-chain metadata.
 *
 * @param props.metadata - Metadata object.
 */
export function MetadataView(props: {
  metadata: Record<string, unknown> | null | undefined
}) {
  const entries = Object.entries(props.metadata ?? {})
  if (entries.length === 0) {
    return <span className="text-muted-foreground">None</span>
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <li
          className="rounded-lg bg-muted px-2 py-0.5 font-mono text-xs"
          key={key}
        >
          {key}
          {value === '' || value === null ? '' : `=${String(value)}`}
        </li>
      ))}
    </ul>
  )
}
