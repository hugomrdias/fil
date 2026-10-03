import { StreamableHTTPTransport } from '@hono/mcp'
import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { cors } from 'hono/cors'
import { timing } from 'hono/timing'
import { type DbFactory, hyperdriveDb } from './db.ts'
import { errorBody, toErrorResponse } from './errors.ts'
import { checkHealth } from './health.ts'
import { log } from './log.ts'
import { buildMcpServer } from './mcp/server.ts'
import { rateLimit } from './middleware/rate-limit.ts'
import { requestId } from './middleware/request-id.ts'
import { requestTelemetry } from './middleware/telemetry.ts'
import { NETWORK_NAMES } from './networks.ts'
import { validationHook } from './routes/hook.ts'
import { networkRoutes } from './routes/network.ts'
import { retrievalRoutes } from './routes/retrieval.ts'
import { activeSpan, recordError } from './tracing.ts'
import type { AppEnv } from './types.ts'

/** API version reported in OpenAPI and MCP server info. */
export const VERSION = '0.0.0'

/** Options for {@link createApp}. */
export interface AppOptions {
  /** Database client factory; tests inject fakes. */
  dbFactory?: DbFactory
}

/**
 * Create the fil-api Hono app: REST routes under `/{network}`, OpenAPI
 * document, API reference and the MCP endpoint.
 *
 * @see https://hono.dev/examples/zod-openapi
 */
export function createApp(options: AppOptions = {}) {
  const dbFactory = options.dbFactory ?? hyperdriveDb
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })

  app.use(requestId)
  app.use(timing({ total: true, crossOrigin: true }))
  app.use(requestTelemetry)
  app.use(
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Content-Type',
        'Accept',
        'Authorization',
        'Mcp-Session-Id',
        'Mcp-Protocol-Version',
        'Last-Event-ID',
      ],
      exposeHeaders: [
        'Mcp-Session-Id',
        'X-Request-Id',
        'Retry-After',
        'Server-Timing',
      ],
    })
  )

  app.get('/', (c) =>
    c.json({
      name: 'fil-api',
      version: VERSION,
      networks: NETWORK_NAMES,
      get: '/get/{cid}',
      openapi: '/openapi.json',
      docs: '/docs',
      mcp: '/mcp',
    })
  )
  // Health queries every network's database, so it shares the API limit.
  app.get('/health', rateLimit('RATE_LIMIT_API'), async (c) => {
    const health = await checkHealth({
      env: c.env,
      dbFactory,
      dbStats: c.var.dbStats,
      waitUntil: (p) => c.executionCtx.waitUntil(p),
      requestId: c.var.requestId,
    })
    c.header('Cache-Control', 'no-store')
    return c.json(health, health.ok ? 200 : 503)
  })

  // The document only depends on the origin, so generate it once per isolate
  // and origin instead of on every request.
  let openapi: { origin: string; doc: unknown } | undefined
  app.get('/openapi.json', (c) => {
    const origin = new URL(c.req.url).origin
    if (openapi?.origin !== origin) {
      openapi = {
        origin,
        doc: app.getOpenAPI31Document({
          openapi: '3.1.0',
          info: {
            title: 'fil-api',
            version: VERSION,
            description:
              'Read-only Filecoin Onchain Cloud data: storage providers, data sets, pieces, Filecoin Pay rails and session keys.',
          },
          servers: [{ url: origin }],
          tags: [
            { name: 'Status' },
            { name: 'Providers' },
            { name: 'Data sets' },
            { name: 'Pieces' },
            { name: 'Rails' },
            { name: 'Session keys' },
            { name: 'Retrieval' },
          ],
        }),
      }
    }
    c.header('Cache-Control', 'public, max-age=300')
    return c.json(openapi.doc)
  })
  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'fil-api' }))

  app.on(['GET', 'DELETE'], '/mcp', (c) => {
    c.header('Allow', 'POST')
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed: stateless server',
        },
        id: null,
      },
      405
    )
  })
  app.post('/mcp', rateLimit('RATE_LIMIT_MCP'), async (c) => {
    const { server, closeDbs } = buildMcpServer({
      env: c.env,
      dbFactory,
      dbStats: c.var.dbStats,
      version: VERSION,
      requestId: c.var.requestId,
    })
    const transport = new StreamableHTTPTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    try {
      await server.connect(transport)
      return await transport.handleRequest(c)
    } finally {
      c.executionCtx.waitUntil(closeDbs().then(() => server.close()))
    }
  })

  app.route('/', networkRoutes(dbFactory))
  app.route('/', retrievalRoutes(dbFactory))

  app.notFound((c) => c.json(errorBody('not_found', 'Route not found'), 404))

  app.onError((error, c) => {
    const { status, body, unexpected } = toErrorResponse(error)
    if (unexpected) {
      recordError(activeSpan(), error)
      log('error', {
        message: 'unhandled error',
        requestId: c.var.requestId,
        path: c.req.path,
        error: error.message,
        stack: error.stack,
      })
    }
    return c.json(body, status)
  })

  return app
}
