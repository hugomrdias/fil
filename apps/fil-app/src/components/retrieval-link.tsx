import { createPieceUrl } from '@filoz/synapse-core/utils'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ExternalLinkIcon } from 'lucide-react'
import { providersInfinite } from '@/lib/api/queries'
import { CHAINS, type Network } from '@/lib/networks'
import { useFlatPages } from '@/lib/route-helpers'

/** Where a piece can be retrieved from. */
export interface RetrievalSource {
  /** Provider storing the piece. */
  providerId: string | null
  /** Data set owner; the FilBeam CDN subdomain. */
  owner?: string | null
  /** Whether the data set pays for the FilBeam CDN. */
  cdn?: boolean | null
  /** Provider PDP service URL, when already known. */
  serviceUrl?: string | null
}

/**
 * Service URL of a provider, from the cached list of every registered
 * provider.
 *
 * @param network - Filecoin network.
 * @param providerId - Provider id.
 */
function useServiceUrl(network: Network, providerId: string | null) {
  const providers = useFlatPages(
    useInfiniteQuery({
      ...providersInfinite(network, {}, 100),
      staleTime: 10 * 60_000,
      enabled: providerId !== null,
    }).data
  )
  return providers.find((p) => p.providerId === providerId)?.serviceUrl
}

/**
 * Link that opens a piece's retrieval URL in a new tab: FilBeam when the
 * data set has CDN, otherwise the provider's `/piece/{cid}` endpoint.
 *
 * @param props.network - Filecoin network.
 * @param props.cid - PieceCID.
 * @param props.source - Provider, owner and CDN of the piece's data set.
 * @see https://docs.filecoin.cloud
 */
export function RetrievalLink(props: {
  network: Network
  cid: string | null
  source: RetrievalSource
}) {
  const { network, cid, source } = props
  const fetched = useServiceUrl(
    network,
    source.serviceUrl ? null : source.providerId
  )
  const serviceURL = source.serviceUrl ?? fetched
  const chain = CHAINS[network]
  const cdn = Boolean(source.cdn && source.owner && chain.filbeam)
  if (!cid || !(cdn || serviceURL?.startsWith('http'))) {
    return <span className="text-muted-foreground">—</span>
  }
  const url = createPieceUrl({
    cid,
    cdn,
    address: (source.owner ?? '') as `0x${string}`,
    chain,
    serviceURL: serviceURL ?? '',
  })
  return (
    <a
      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
      href={url}
      rel="noreferrer"
      target="_blank"
      title={url}
    >
      Open
      <ExternalLinkIcon className="size-3.5" />
    </a>
  )
}
