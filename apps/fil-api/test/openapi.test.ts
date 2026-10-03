import { describe, expect, it } from 'vitest'
import { testApp } from './helpers.ts'

interface OpenApiDoc {
  openapi: string
  paths: Record<string, Record<string, { parameters?: { name: string }[] }>>
}

describe('openapi', () => {
  it('documents every network route', async () => {
    const { request } = testApp()
    const doc = (await (await request('/openapi.json')).json()) as OpenApiDoc
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths).sort()).toEqual(
      [
        '/{network}/status',
        '/{network}/providers',
        '/{network}/providers/{providerId}',
        '/{network}/data-sets',
        '/{network}/data-sets/{dataSetId}',
        '/{network}/data-sets/{dataSetId}/pieces',
        '/{network}/data-sets/{dataSetId}/pieces/{pieceId}',
        '/{network}/pieces',
        '/{network}/rails',
        '/{network}/rails/{railId}',
        '/{network}/rails/{railId}/settlements',
        '/{network}/session-keys',
        '/{network}/session-keys/history',
        '/get/{cid}',
      ].sort()
    )
    const params = doc.paths['/{network}/pieces']?.get?.parameters?.map(
      (p) => p.name
    )
    expect(params).toEqual(
      expect.arrayContaining([
        'network',
        'owner',
        'cid',
        'provider_id',
        'limit',
      ])
    )
  })

  it('serves the API reference', async () => {
    const { request } = testApp()
    const res = await request('/docs')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('/openapi.json')
  })
})
