import { calculate } from '@filoz/synapse-core/piece'
import { CID } from 'multiformats/cid'
import { create } from 'multiformats/hashes/digest'
import { describe, expect, it } from 'vitest'
import {
  INBROWSER_URL,
  PROVIDER_REDIRECT_CACHE_CONTROL,
} from '../src/routes/retrieval.ts'
import { fakeLimiter, rows, testApp } from './helpers.ts'

const SERVICE_URL = rows.provider.service_url
const providerRow = {
  provider_id: '2',
  service_url: SERVICE_URL,
  ipfs_root_cid: null,
}
const ROOT_CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

let seed = 0

/**
 * A PieceCID no other test uses, so `caches.default` entries from earlier
 * tests in this file do not leak in.
 */
async function uniquePieceCid() {
  return (await calculate(new Uint8Array(127).fill(++seed))).toString()
}

/** A raw-codec IPFS CID no other test uses. */
function uniqueIpfsCid() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return CID.createV1(0x55, create(0x12, bytes)).toString()
}

describe('GET /get/{cid}', () => {
  it('redirects a PieceCID to a mainnet provider and caches it', async () => {
    const cid = await uniquePieceCid()
    const { request, fake } = testApp(() => [providerRow])
    const res = await request(`/get/${cid}`)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`${SERVICE_URL}/piece/${cid}`)
    expect(res.headers.get('x-cache')).toBe('miss')
    expect(res.headers.get('cache-control')).toBe(
      PROVIDER_REDIRECT_CACHE_CONTROL
    )
    expect(fake.queries).toHaveLength(1)
    expect(fake.queries[0]?.text).toContain('p.cid = $1')
    expect(fake.queries[0]?.params).toEqual([cid])
    expect(fake.closed).toBe(1)

    const again = await request(`/get/${cid}`)
    expect(again.headers.get('location')).toBe(`${SERVICE_URL}/piece/${cid}`)
    expect(again.headers.get('x-cache')).toBe('hit')
    expect(fake.queries).toHaveLength(1)
  })

  it('caches providers per network', async () => {
    const cid = await uniquePieceCid()
    const { request, fake } = testApp(() => [providerRow])
    await request(`/get/${cid}?network=calibration`)
    const res = await request(`/get/${cid}`)
    expect(res.headers.get('x-cache')).toBe('miss')
    expect(fake.queries).toHaveLength(2)
  })

  it('sends PieceCIDs without an IPFS root to the provider with browser=true', async () => {
    const cid = await uniquePieceCid()
    const { request } = testApp(() => [providerRow])
    const res = await request(`/get/${cid}?browser=true`)
    expect(res.headers.get('location')).toBe(`${SERVICE_URL}/piece/${cid}`)
  })

  it('opens PieceCIDs with an IPFS root in inbrowser.link with browser=true', async () => {
    const cid = await uniquePieceCid()
    const { request, fake } = testApp(() => [
      { ...providerRow, ipfs_root_cid: ROOT_CID },
    ])
    const res = await request(`/get/${cid}?browser=true&filename=a.txt`)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      `${INBROWSER_URL}/ipfs/${ROOT_CID}?filename=a.txt`
    )
    expect(res.headers.get('x-cache')).toBe('miss')
    expect(fake.queries[0]?.text).toContain(
      `case when d.with_ipfs_indexing then p.metadata->>'ipfsRootCID' end`
    )

    // The cached entry keeps the root, and plain requests still get bytes.
    const cached = await request(`/get/${cid}?browser=true`)
    expect(cached.headers.get('location')).toBe(
      `${INBROWSER_URL}/ipfs/${ROOT_CID}`
    )
    expect(cached.headers.get('x-cache')).toBe('hit')
    const raw = await request(`/get/${cid}`)
    expect(raw.headers.get('location')).toBe(`${SERVICE_URL}/piece/${cid}`)
    expect(fake.queries).toHaveLength(1)
  })

  it.each(['nope', rows.piece.cid])(
    'ignores an ipfsRootCID of %s that is not an IPFS CID',
    async (root) => {
      const cid = await uniquePieceCid()
      const { request } = testApp(() => [
        { ...providerRow, ipfs_root_cid: root },
      ])
      const res = await request(`/get/${cid}?browser=true`)
      expect(res.headers.get('location')).toBe(`${SERVICE_URL}/piece/${cid}`)
    }
  )

  it('redirects IPFS root CIDs to the provider gateway', async () => {
    const cid = uniqueIpfsCid()
    const { request, fake } = testApp(() => [providerRow])
    const res = await request(
      `/get/${cid}?network=calibration&browser=false&format=car`
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      `${SERVICE_URL}/ipfs/${cid}?format=car`
    )
    expect(fake.queries[0]?.text).toContain('with_ipfs_indexing')
    expect(fake.queries[0]?.text).toContain(
      `p.metadata->>'ipfsRootCID' in ($1)`
    )
    expect(fake.queries[0]?.params).toEqual([cid])
  })

  it('matches IPFS roots recorded as CIDv0 or CIDv1', async () => {
    const { request, fake } = testApp((_text, params) =>
      params.includes('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
        ? [providerRow]
        : []
    )
    const v1 = 'bafybeie5nqv6kd3qnfjupgvz34woh3oksc3iau6abmyajn7qvtf6d2ho34'
    const res = await request(
      '/get/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG?network=calibration'
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`${SERVICE_URL}/ipfs/${v1}`)
    expect(fake.queries[0]?.params).toEqual([
      v1,
      'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
    ])
  })

  it('redirects IPFS CIDs to inbrowser.link with browser=true', async () => {
    const { request, fake } = testApp()
    const res = await request(
      '/get/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG?browser=true&filename=a.txt'
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      `${INBROWSER_URL}/ipfs/bafybeie5nqv6kd3qnfjupgvz34woh3oksc3iau6abmyajn7qvtf6d2ho34?filename=a.txt`
    )
    expect(res.headers.get('x-cache')).toBe('none')
    expect(fake.queries).toHaveLength(0)
  })

  it('keeps the service URL path and avoids double slashes', async () => {
    const cid = await uniquePieceCid()
    const { request } = testApp(() => [
      { provider_id: '3', service_url: 'https://sp.example/curio/' },
    ])
    const res = await request(`/get/${cid}`)
    expect(res.headers.get('location')).toBe(
      `https://sp.example/curio/piece/${cid}`
    )
  })

  it('returns 404 without caching when no provider serves the CID', async () => {
    const cid = await uniquePieceCid()
    const { request, fake } = testApp(() => [])
    const res = await request(`/get/${cid}`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: { code: 'not_found', message: `Piece ${cid} not found` },
    })
    await request(`/get/${cid}`)
    expect(fake.queries).toHaveLength(2)
  })

  it.each([
    '/get/nope',
    '/get/baga6ea4seaqao7s73y24kcutaosvacpdjgfe5pw76ooefnyqw4ynr3d2y6x2mpq',
    `/get/${rows.piece.cid}?network=filecoin`,
    `/get/${rows.piece.cid}?browser=yes`,
  ])('returns 400 for %s', async (path) => {
    const { request, fake } = testApp()
    const res = await request(path)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: { code: 'invalid_request' },
    })
    expect(fake.queries).toHaveLength(0)
  })

  it('returns 503 for a network without a database binding', async () => {
    const cid = await uniquePieceCid()
    const { request } = testApp(undefined, { HYPERDRIVE_MAINNET: undefined })
    const res = await request(`/get/${cid}`)
    expect(res.status).toBe(503)
  })

  it('is rate limited', async () => {
    const { request } = testApp(undefined, {
      RATE_LIMIT_API: fakeLimiter(false),
    })
    const res = await request(`/get/${rows.piece.cid}`)
    expect(res.status).toBe(429)
  })
})
