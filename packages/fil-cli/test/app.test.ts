import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { custom, http } from 'viem'
import { withSignal } from '../src/app.ts'
import { abortable } from '../src/errors.ts'

/** Collect unhandled rejections while `fn` runs and one macrotask after. */
async function unhandledDuring(fn: () => Promise<void>): Promise<unknown[]> {
  const seen: unknown[] = []
  const record = (reason: unknown) => seen.push(reason)
  process.on('unhandledRejection', record)
  try {
    await fn()
    await setImmediate()
  } finally {
    process.off('unhandledRejection', record)
  }
  return seen
}

test('a signal-bound transport rejects in-flight and later requests on abort', async () => {
  let calls = 0
  const hanging = custom({
    request: () => {
      calls++
      return new Promise(() => undefined)
    },
  })
  const controller = new AbortController()
  const transport = withSignal(hanging, controller.signal)({ retryCount: 0 })

  const inflight = transport.request({ method: 'eth_blockNumber' })
  controller.abort('SIGTERM')
  await assert.rejects(inflight, (reason) => reason === 'SIGTERM')
  await assert.rejects(
    transport.request({ method: 'eth_blockNumber' }),
    (reason) => reason === 'SIGTERM'
  )
  assert.equal(calls, 1, 'no request starts after the abort')
})

test('a signal-bound http transport keeps its request timeout', {
  timeout: 5000,
}, async () => {
  // Accepts connections but never answers, like a stuck RPC endpoint.
  const server = createServer(() => undefined)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  after(() => {
    server.closeAllConnections()
    server.close()
  })
  const { port } = server.address() as AddressInfo
  const transport = withSignal(
    http(`http://127.0.0.1:${port}`, { timeout: 200, retryCount: 0 }),
    new AbortController().signal
  )({})

  await assert.rejects(transport.request({ method: 'eth_blockNumber' }), {
    name: 'TimeoutError',
  })
})

test('abortable handles the call when the signal already aborted', async () => {
  const controller = new AbortController()
  controller.abort('SIGINT')
  const unhandled = await unhandledDuring(async () => {
    const call = Promise.reject(new Error('late failure'))
    await assert.rejects(
      abortable(call, controller.signal),
      (reason) => reason === 'SIGINT'
    )
  })
  assert.deepEqual(unhandled, [])
})

test('abortable handles a call that fails after the abort', async () => {
  const controller = new AbortController()
  let fail: (error: Error) => void = () => undefined
  const call = new Promise<never>((_, reject) => {
    fail = reject
  })
  const unhandled = await unhandledDuring(async () => {
    const pending = abortable(call, controller.signal)
    controller.abort('SIGINT')
    await assert.rejects(pending, (reason) => reason === 'SIGINT')
    fail(new Error('late failure'))
  })
  assert.deepEqual(unhandled, [])
})
