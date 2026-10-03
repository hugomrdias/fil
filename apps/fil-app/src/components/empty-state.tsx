import { Link } from '@tanstack/react-router'
import { CircleAlertIcon, SearchXIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

/**
 * Generic empty state.
 *
 * @param props.title - Heading.
 * @param props.description - Body text.
 * @param props.icon - Icon element.
 * @param props.children - Actions.
 */
export function EmptyState(props: {
  title: string
  description?: ReactNode
  icon?: ReactNode
  children?: ReactNode
}) {
  return (
    <Empty className="rounded-3xl border">
      <EmptyHeader>
        {props.icon ? (
          <EmptyMedia variant="icon">{props.icon}</EmptyMedia>
        ) : null}
        <EmptyTitle>{props.title}</EmptyTitle>
        {props.description ? (
          <EmptyDescription>{props.description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {props.children ? <EmptyContent>{props.children}</EmptyContent> : null}
    </Empty>
  )
}

/** Router not-found page. */
export function NotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <EmptyState
        description="The page or record you are looking for does not exist on this network."
        icon={<SearchXIcon />}
        title="Not found"
      >
        <Button nativeButton={false} render={<Link to="/" />} variant="outline">
          Go home
        </Button>
      </EmptyState>
    </div>
  )
}

/**
 * Route error boundary content.
 *
 * @param props.error - Thrown error.
 * @param props.reset - Retry callback.
 */
export function ErrorState(props: { error: unknown; reset?: () => void }) {
  const message =
    props.error instanceof Error ? props.error.message : String(props.error)
  return (
    <EmptyState
      description={message}
      icon={<CircleAlertIcon />}
      title="Something went wrong"
    >
      {props.reset ? (
        <Button onClick={props.reset} variant="outline">
          Try again
        </Button>
      ) : null}
    </EmptyState>
  )
}
