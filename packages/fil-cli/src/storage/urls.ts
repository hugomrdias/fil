import { createPieceUrlPDP } from '@filoz/synapse-core/piece'
import type { Resource } from '../state/resources.ts'

/** Curio retrieval URLs for stored content. */
export type RetrievalUrls = {
  /** Exact stored bytes: `/piece/<pieceCid>`. */
  piece: string
  /** UnixFS content through Curio's trustless gateway: `/ipfs/<rootCid>/`. */
  ipfs?: string
}

/**
 * Build Curio retrieval URLs for a piece and, for artifacts, its IPFS root.
 *
 * @see https://github.com/filecoin-project/curio/blob/main/documentation/en/curio-market/retrievals.md
 */
export function retrievalUrls(options: {
  serviceURL: string
  pieceCid: string
  rootCid?: string
}): RetrievalUrls {
  const base = options.serviceURL.endsWith('/')
    ? options.serviceURL
    : `${options.serviceURL}/`
  return {
    piece: createPieceUrlPDP({ cid: options.pieceCid, serviceURL: base }),
    ...(options.rootCid
      ? { ipfs: new URL(`ipfs/${options.rootCid}/`, base).toString() }
      : {}),
  }
}

/** Curio retrieval URLs for a resource's first copy. */
export function resourceUrls(resource: Resource): RetrievalUrls {
  const [copy] = resource.copies
  if (!copy) throw new Error(`Resource ${resource.ref} has no stored copies.`)
  return retrievalUrls({
    serviceURL: copy.serviceURL,
    pieceCid: resource.pieceCid,
    rootCid: resource.rootCid,
  })
}
