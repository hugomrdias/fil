import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'
import { ErrorState } from '@/components/empty-state'
import { IndexerBanner } from '@/components/indexer-banner'
import { isNetwork, type Network } from '@/lib/networks'

export const Route = createFileRoute('/$network')({
  params: {
    parse: (params) => ({ network: params.network as Network }),
    stringify: (params) => ({ network: params.network }),
  },
  beforeLoad: ({ params }) => {
    if (!isNetwork(params.network)) {
      throw notFound()
    }
  },
  component: NetworkLayout,
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <ErrorState error={error} reset={reset} />
    </div>
  ),
})

/** Explorer layout for one network. */
function NetworkLayout() {
  const { network } = Route.useParams()
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
      <IndexerBanner network={network} />
      <Outlet />
    </div>
  )
}
