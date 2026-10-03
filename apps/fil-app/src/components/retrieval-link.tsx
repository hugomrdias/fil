import { ExternalLinkIcon } from 'lucide-react'
import { env } from '@/config/env'
import type { Network } from '@/lib/networks'
import { retrievalUrl } from '@/lib/retrieval'

/**
 * Link that opens a piece through fil-api's `/get/{cid}` in a new tab. fil-api
 * redirects to a provider serving the piece, or to inbrowser.link when the
 * piece has an IPFS root.
 *
 * @param props.network - Filecoin network.
 * @param props.cid - PieceCID.
 */
export function RetrievalLink(props: { network: Network; cid: string | null }) {
  const { network, cid } = props
  if (!cid) {
    return <span className="text-muted-foreground">—</span>
  }
  const url = retrievalUrl(env.filApiUrl, network, cid)
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
