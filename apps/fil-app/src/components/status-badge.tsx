import { cn } from '@/lib/utils'

/** Visual tone of a status badge. */
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const TONE: Record<StatusTone, string> = {
  success:
    'bg-success/10 text-green-700 *:data-dot:bg-success dark:text-success',
  warning:
    'bg-warning/10 text-amber-700 *:data-dot:bg-warning dark:text-warning',
  danger: 'bg-destructive/10 text-destructive *:data-dot:bg-destructive',
  neutral: 'bg-muted text-muted-foreground *:data-dot:bg-muted-foreground',
  info: 'bg-primary/10 text-primary *:data-dot:bg-primary',
}

/**
 * Status pill with a coloured dot.
 *
 * @param props.tone - Colour tone.
 * @param props.children - Label.
 */
export function StatusBadge(props: {
  tone: StatusTone
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap',
        TONE[props.tone]
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full" data-dot />
      {props.children}
    </span>
  )
}

/**
 * Yes/no badge for nullable booleans.
 *
 * @param props.value - Flag value.
 * @param props.yes - Label when true.
 * @param props.no - Label when false.
 */
export function FlagBadge(props: {
  value: boolean | null | undefined
  yes?: string
  no?: string
}) {
  if (props.value === null || props.value === undefined) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <StatusBadge tone={props.value ? 'success' : 'neutral'}>
      {props.value ? (props.yes ?? 'Yes') : (props.no ?? 'No')}
    </StatusBadge>
  )
}

/** Rail lifecycle state from fil-api. */
export type RailState = 'active' | 'terminated' | 'finalized'

const RAIL_TONE: Record<RailState, StatusTone> = {
  active: 'success',
  terminated: 'warning',
  finalized: 'neutral',
}

/**
 * Badge for a rail lifecycle state.
 *
 * @param props.state - Rail state.
 */
export function RailStateBadge(props: { state: RailState }) {
  return (
    <StatusBadge tone={RAIL_TONE[props.state]}>
      {props.state.charAt(0).toUpperCase() + props.state.slice(1)}
    </StatusBadge>
  )
}
