import { defineCommand } from 'clipact'
import * as z from 'zod'
import { ErrorCodes } from '../errors.ts'
import { account, accountEnv, resource, urls } from './shared.ts'

/** `fil inspect <ref>`: show a resource and its retrieval URLs. */
export const inspect = defineCommand({
  name: 'inspect',
  description: 'Show a managed resource and its retrieval URLs',
  examples: ['fil inspect res_abc123', 'fil inspect res_abc123 --check'],
  input: z.strictObject({
    ref: z.string().describe('Resource ref (res_…)'),
    check: z
      .boolean()
      .default(false)
      .describe('Probe the piece URL with a HEAD request'),
    ...account,
  }),
  positionals: ['ref'],
  env: accountEnv,
  secrets: ['sessionKey'],
  output: z.object({
    resource,
    urls,
    retrieval: z
      .object({
        url: z.string(),
        state: z.enum(['ready', 'unavailable']),
        status: z.number().int().describe('HTTP status; 0 when unreachable'),
        checkedAt: z.string(),
      })
      .optional(),
  }),
  errors: [
    ErrorCodes.authRequired,
    ErrorCodes.loginPending,
    ErrorCodes.notFound,
  ],
  readOnly: true,
  human: ({ resource: r, urls: u, retrieval }) =>
    [
      `${r.ref} ${r.kind} ${r.name} (${r.status})`,
      `pieceCid: ${r.pieceCid}`,
      ...(r.rootCid ? [`rootCid: ${r.rootCid}`] : []),
      `piece: ${u.piece}`,
      `browser: ${u.browser}`,
      ...(retrieval
        ? [`retrieval: ${retrieval.state} (HTTP ${retrieval.status})`]
        : []),
    ].join('\n'),
  handler: () => import('../handlers/inspect.ts'),
})
