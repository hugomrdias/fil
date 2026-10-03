import { useQueries } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { SearchXIcon } from 'lucide-react'
import { z } from 'zod'
import { EmptyState } from '@/components/empty-state'
import { HeroSearch } from '@/components/hero-search'
import { PageHeader } from '@/components/page-header'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api/client'
import { dataSetQuery, providerQuery, railQuery } from '@/lib/api/queries'
import { ID_RE } from '@/lib/search'

export const Route = createFileRoute('/$network/search')({
  validateSearch: z.object({
    q: z.string().regex(ID_RE).catch(''),
  }),
  component: SearchResults,
})

/** Results for a numeric id: matching data set, rail and provider. */
function SearchResults() {
  const { network } = Route.useParams()
  const { q } = Route.useSearch()
  const enabled = q !== ''
  const opts = { enabled } as const
  const [dataSet, rail, provider] = useQueries({
    queries: [
      { ...dataSetQuery(network, q), ...opts },
      { ...railQuery(network, q), ...opts },
      { ...providerQuery(network, q), ...opts },
    ],
  })
  const loading = enabled && [dataSet, rail, provider].some((r) => r.isPending)
  const failed = [dataSet, rail, provider].find(
    (r) => r.error && !ApiError.isNotFound(r.error)
  )
  const results = [
    dataSet.data && {
      key: 'data-set',
      description: `Owner ${dataSet.data.owner ?? 'unknown'}`,
      link: (
        <Link params={{ network, id: q }} to="/$network/data-sets/$id">
          <CardTitle className="text-primary">Data set #{q}</CardTitle>
        </Link>
      ),
    },
    rail.data && {
      key: 'rail',
      description: `${rail.data.state} · payer ${rail.data.payer}`,
      link: (
        <Link params={{ network, id: q }} to="/$network/rails/$id">
          <CardTitle className="text-primary">Rail #{q}</CardTitle>
        </Link>
      ),
    },
    provider.data && {
      key: 'provider',
      description: provider.data.name ?? provider.data.address,
      link: (
        <Link params={{ network, id: q }} to="/$network/providers/$id">
          <CardTitle className="text-primary">Provider #{q}</CardTitle>
        </Link>
      ),
    },
  ].filter((r) => r !== undefined)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Results for “${q}”`} />
      <HeroSearch className="max-w-2xl" network={network} />
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : results.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {results.map((result) => (
            <Card key={result.key}>
              <CardHeader>
                {result.link}
                <CardDescription className="truncate">
                  {result.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          description={
            failed?.error
              ? failed.error.message
              : 'No data set, rail or provider has this id.'
          }
          icon={<SearchXIcon />}
          title="No results"
        />
      )}
    </div>
  )
}
