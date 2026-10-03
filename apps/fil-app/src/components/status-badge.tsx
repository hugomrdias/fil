import { cn } from '@/lib/utils'

/** Visual tone of a status badge. */
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const DOT: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  neutral: 'bg-muted-foreground',
  info: 'bg-brand-500',
}

/**
 * Status label with a coloured dot.
 *
 * @param props.tone - Colour tone.
 * @param props.children - Label.
 */
export function StatusBadge(props: {
  tone: StatusTone
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span
        aria-hidden
        className={cn('size-2 rounded-full shadow-[0_0_6px]', DOT[props.tone])}
      />
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
