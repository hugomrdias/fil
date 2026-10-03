import { describe, expect, it } from 'vitest'
import { fakeLimiter, rows, testApp } from './helpers.ts'

describe('rate limits', () => {
  it('returns 429 with Retry-After when the API limiter rejects', async () => {
    const { request, fake } = testApp(() => [rows.provider], {
      RATE_LIMIT_API: fakeLimiter(false),
    })
    const res = await request('/calibration/providers')
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('60')
    expect(await res.json()).toMatchObject({ error: { code: 'rate_limited' } })
    expect(fake.queries).toHaveLength(0)
  })

  it('limits MCP separately', async () => {
    const { request } = testApp(undefined, {
      RATE_LIMIT_MCP: fakeLimiter(false),
    })
    const res = await request('/mcp', { method: 'POST', body: '{}' })
    expect(res.status).toBe(429)
  })

  it('limits health, which queries every database', async () => {
    const { request, fake } = testApp(() => [rows.checkpoint], {
      RATE_LIMIT_API: fakeLimiter(false),
    })
    expect((await request('/health')).status).toBe(429)
    expect(fake.queries).toHaveLength(0)
  })

  it('does not limit docs or the OpenAPI document', async () => {
    const { request } = testApp(undefined, {
      RATE_LIMIT_API: fakeLimiter(false),
      RATE_LIMIT_MCP: fakeLimiter(false),
    })
    for (const path of ['/openapi.json', '/docs']) {
      expect((await request(path)).status).toBe(200)
    }
  })
})
