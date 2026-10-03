import type { ReactNode } from 'react'

/**
 * Page title row with optional description and actions.
 *
 * @param props.title - Page heading.
 * @param props.description - Supporting text.
 * @param props.actions - Right-aligned actions.
 */
export function PageHeader(props: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate text-xl font-semibold tracking-tight">
          {props.title}
        </h1>
        {props.description ? (
          <p className="text-sm text-muted-foreground">{props.description}</p>
        ) : null}
      </div>
      {props.actions ? (
        <div className="flex items-center gap-2">{props.actions}</div>
      ) : null}
    </div>
  )
}

/**
 * Compact stat tile.
 *
 * @param props.label - Stat label.
 * @param props.value - Stat value.
 * @param props.hint - Secondary line.
 */
export function StatCard(props: {
  label: string
  value: ReactNode
  hint?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 border bg-card p-4">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <span className="truncate text-lg font-semibold tabular-nums">
        {props.value}
      </span>
      {props.hint ? (
        <span className="text-xs text-muted-foreground">{props.hint}</span>
      ) : null}
    </div>
  )
}
