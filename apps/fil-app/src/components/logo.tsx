import { cn } from '@/lib/utils'

/** Glyph of the Filecoin mark, drawn on a 40×40 grid. */
const GLYPH =
  'M21.9,17.6l-0.6,3.2l5.7,0.8l-0.4,1.5L21,22.3c-0.4,1.3-0.6,2.7-1.1,3.9c-0.5,1.4-1,2.8-1.6,4.1c-0.8,1.7-2.2,2.9-4.1,3.2c-1.1,0.2-2.3,0.1-3.2-0.6c-0.3-0.2-0.6-0.6-0.6-0.9c0-0.4,0.2-0.9,0.5-1.1c0.2-0.1,0.7,0,1,0.1c0.3,0.3,0.6,0.7,0.8,1.1c0.6,0.8,1.4,0.9,2.2,0.3c0.9-0.8,1.4-1.9,1.7-3c0.6-2.4,1.2-4.7,1.7-7.1v-0.4L13,21.1l0.2-1.5l5.5,0.8l0.7-3.1l-5.7-0.9l0.2-1.6l5.9,0.8c0.2-0.6,0.3-1.1,0.5-1.6c0.5-1.8,1-3.6,2.2-5.2s2.6-2.6,4.7-2.5c0.9,0,1.8,0.3,2.4,1c0.1,0.1,0.3,0.3,0.3,0.5c0,0.4,0,0.9-0.3,1.2c-0.4,0.3-0.9,0.2-1.3-0.2c-0.3-0.3-0.5-0.6-0.8-0.9C26.9,7.1,26,7,25.3,7.7c-0.5,0.5-1,1.2-1.3,1.9c-0.7,2.1-1.2,4.3-1.9,6.5l5.5,0.8l-0.4,1.5L21.9,17.6Z'

/**
 * The Filecoin mark: a white glyph on a Filecoin-blue (#0090FF) disc.
 *
 * @param props.className - Extra classes; size it with `size-*`.
 * @see https://filecoin.io/brand
 */
export function Logo(props: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={props.className}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="20" cy="20" fill="#0090FF" r="20" />
      <path d={GLYPH} fill="#fff" />
    </svg>
  )
}

/**
 * Logo plus the product name, used at the top of both shells.
 *
 * @param props.className - Extra classes.
 */
export function Wordmark(props: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', props.className)}>
      <Logo className="size-8 shrink-0" />
      <span className="text-base font-semibold leading-none tracking-tight">
        Filecoin
      </span>
    </span>
  )
}
