import { useQuery } from '@tanstack/react-query'
import { TriangleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { statusQuery } from '@/lib/api/queries'
import { formatRelative } from '@/lib/format'
import type { Network } from '@/lib/networks'

/** Indexer lag after which data is flagged as delayed. */
const LAG_SECONDS = 10 * 60

/**
 * Warning shown when the fil-api indexer is behind or unreachable.
 *
 * @param props.network - Filecoin network.
 */
export function IndexerBanner(props: { network: Network }) {
  const { data, isError } = useQuery(statusQuery(props.network))

  if (isError) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>Indexer status unavailable</AlertTitle>
        <AlertDescription>
          fil-api could not report indexer progress; data may be stale.
        </AlertDescription>
      </Alert>
    )
  }

  const now = Date.now() / 1000
  const lagging =
    data?.indexers.filter(
      (indexer) =>
        indexer.latest && now - indexer.latest.timestamp >= LAG_SECONDS
    ) ?? []
  if (lagging.length === 0) {
    return null
  }
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertTitle>Data may be delayed</AlertTitle>
      <AlertDescription>
        {lagging.map((indexer) => (
          <span key={indexer.schema}>
            The {indexer.schema} indexer last processed a block{' '}
            {formatRelative(new Date((indexer.latest?.timestamp ?? 0) * 1000))}.
          </span>
        ))}
      </AlertDescription>
    </Alert>
  )
}
