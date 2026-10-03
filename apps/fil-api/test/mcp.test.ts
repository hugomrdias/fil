import { describe, expect, it } from 'vitest'
import { rows, testApp } from './helpers.ts'

function rpc(method: string, params: unknown = {}, id = 1) {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  }
}

interface RpcResult<T> {
  result: T
}

describe('mcp', () => {
  it('initializes', async () => {
    const { request } = testApp()
    const res = await request(
      '/mcp',
      rpc('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as RpcResult<{
      serverInfo: { name: string }
    }>
    expect(body.result.serverInfo.name).toBe('fil-api')
  })

  it('lists every tool with a network argument', async () => {
    const { request } = testApp()
    const res = await request('/mcp', rpc('tools/list'))
    const body = (await res.json()) as RpcResult<{
      tools: { name: string; inputSchema: { required?: string[] } }[]
    }>
    const names = body.result.tools.map((t) => t.name)
    expect(names.sort()).toEqual(
      [
        'get_status',
        'list_providers',
        'get_provider',
        'list_data_sets',
        'get_data_set',
        'list_data_set_pieces',
        'get_piece',
        'list_pieces',
        'list_rails',
        'get_rail',
        'list_rail_settlements',
        'list_session_keys',
        'list_session_key_events',
      ].sort()
    )
    for (const tool of body.result.tools) {
      expect(tool.inputSchema.required).toContain('network')
    }
  })

  it('calls list_providers against the database', async () => {
    const { request, fake } = testApp(() => [rows.provider])
    const res = await request(
      '/mcp',
      rpc('tools/call', {
        name: 'list_providers',
        arguments: { network: 'calibration', approved: true, limit: 5 },
      })
    )
    const body = (await res.json()) as RpcResult<{
      structuredContent: { data: { providerId: string }[] }
    }>
    expect(body.result.structuredContent.data[0]?.providerId).toBe('2')
    expect(fake.queries[0]?.params).toEqual([true, 6])
    expect(fake.closed).toBe(1)
  })

  it('returns tool errors for unavailable networks and bad input', async () => {
    const { request } = testApp(undefined, { HYPERDRIVE_MAINNET: undefined })
    const mainnet = (await (
      await request(
        '/mcp',
        rpc('tools/call', {
          name: 'get_status',
          arguments: { network: 'mainnet' },
        })
      )
    ).json()) as RpcResult<{ isError: boolean; content: { text: string }[] }>
    expect(mainnet.result.isError).toBe(true)
    expect(mainnet.result.content[0]?.text).toContain('network_unavailable')

    const pieces = (await (
      await request(
        '/mcp',
        rpc('tools/call', {
          name: 'list_pieces',
          arguments: { network: 'calibration' },
        })
      )
    ).json()) as RpcResult<{ isError: boolean }>
    expect(pieces.result.isError).toBe(true)
  })

  it('hides unexpected tool errors', async () => {
    const { request } = testApp(() => {
      throw new Error('relation "secret" does not exist')
    })
    const body = (await (
      await request(
        '/mcp',
        rpc('tools/call', {
          name: 'list_providers',
          arguments: { network: 'calibration' },
        })
      )
    ).json()) as RpcResult<{ isError: boolean; content: { text: string }[] }>
    expect(body.result.isError).toBe(true)
    expect(body.result.content[0]?.text).toBe(
      'internal_error: Internal server error'
    )
  })

  it('keeps transport HTTP errors instead of turning them into 500s', async () => {
    const { request } = testApp()
    const res = await request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Accept: 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(415)
    expect(await res.json()).toMatchObject({
      error: { code: 'invalid_request' },
    })
  })

  it('rejects GET since the server is stateless', async () => {
    const { request } = testApp()
    expect((await request('/mcp')).status).toBe(405)
  })
})
