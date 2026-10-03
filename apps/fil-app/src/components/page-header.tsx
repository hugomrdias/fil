import type { ReactNode } from 'react'

/**
 * Page title row with optional description and actions.
 *
 * @param props.title - Page heading.
 * @param props.status - Badge shown beside the heading.
 * @param props.description - Supporting text.
 * @param props.actions - Right-aligned actions.
 */
export function PageHeader(props: {
  title: ReactNode
  status?: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
            {props.title}
          </h1>
          {props.status}
        </div>
        {props.description ? (
          <p className="max-w-2xl text-sm text-pretty text-muted-foreground sm:text-base">
            {props.description}
          </p>
        ) : null}
      </div>
      {props.actions ? (
        <div className="flex flex-wrap items-center gap-2">{props.actions}</div>
      ) : null}
    </div>
  )
}
