import { ExternalLinkIcon } from 'lucide-react'
import { shortHex } from '@/lib/format'
import { type Network, txUrl } from '@/lib/networks'

/**
 * Link to a transaction on the block explorer.
 *
 * @param props.network - Filecoin network.
 * @param props.hash - Transaction hash.
 */
export function TxLink(props: { network: Network; hash: string }) {
  return (
    <a
      className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
      href={txUrl(props.network, props.hash)}
      rel="noreferrer"
      target="_blank"
    >
      {shortHex(props.hash, 6)}
      <ExternalLinkIcon className="size-3" />
    </a>
  )
}
