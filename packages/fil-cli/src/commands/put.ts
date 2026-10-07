import { defineCommand } from 'clipact'
import * as z from 'zod'
import { JOB_ERRORS } from '../errors.ts'
import { account, accountEnv, formatBytes, resource, urls } from './shared.ts'

/** What `put --dry-run` reports instead of storing anything. */
const estimate = z.object({
  kind: z.enum(['file', 'folder']),
  name: z.string(),
  size: z
    .number()
    .int()
    .describe('Bytes to store: the file, or the packed CAR'),
  files: z.number().int(),
  rootCid: z.string().optional(),
  network: z.string(),
  authorization: z
    .enum(['ready', 'login_required', 'login_pending', 'scopes_missing'])
    .describe('Whether the session key can sign this put'),
  missingScopes: z.array(z.string()).optional(),
  provider: z
    .object({
      id: z.string(),
      serviceURL: z.string(),
      dataSetId: z.string().optional().describe('Existing data set to add to'),
    })
    .optional(),
  cost: z
    .object({
      token: z.literal('USDFC'),
      ready: z.boolean().describe('The payer can cover it now'),
      depositNeeded: z.string(),
      needsApproval: z.boolean(),
      ratePerMonth: z.string(),
      lockup: z.string(),
      fundingUrl: z.string().optional(),
    })
    .optional(),
  checkedAt: z.string(),
})

/**
 * `fil put <path>` (alias `publish`): store a file as exact bytes, or a
 * directory as a UnixFS CAR served at `/ipfs/<rootCid>/`, with one copy.
 */
export const put = defineCommand({
  name: 'put',
  description:
    'Store a file (raw piece) or directory (UnixFS CAR) with one copy',
  examples: [
    'fil put ./report.pdf',
    'fil put ./site --name docs',
    'fil publish ./site --dry-run',
  ],
  input: z.strictObject({
    path: z.string().describe('File or directory to store'),
    name: z
      .string()
      .min(1)
      .optional()
      .describe('Display name (default: basename)'),
    provider: z
      .string()
      .regex(/^\d+$/, 'Expected a decimal provider ID')
      .optional()
      .describe('Storage provider ID (default: automatic)'),
    ...account,
  }),
  positionals: ['path'],
  env: accountEnv,
  secrets: ['sessionKey'],
  output: z.object({
    dryRun: z.boolean(),
    operationId: z.string().optional().describe('Set when dryRun is false'),
    state: z.literal('ready').optional(),
    resource: resource.optional(),
    urls: urls.optional(),
    estimate: estimate.optional().describe('Set when dryRun is true'),
  }),
  errors: JOB_ERRORS,
  dryRun: true,
  human: (data) => {
    if (data.estimate) {
      const e = data.estimate
      const lines = [
        `Would store ${e.kind} ${e.name}: ${formatBytes(e.size)}, ${e.files} file(s) on ${e.network}`,
        `authorization: ${e.authorization}`,
      ]
      if (e.provider)
        lines.push(`provider: ${e.provider.id} (${e.provider.serviceURL})`)
      if (e.cost) {
        lines.push(
          `cost: ${e.cost.ratePerMonth} USDFC/month, lockup ${e.cost.lockup} USDFC, ${e.cost.ready ? 'funded' : `deposit ${e.cost.depositNeeded} USDFC first`}`
        )
      }
      return lines.join('\n')
    }
    return `Stored ${data.resource?.name} (${data.resource?.ref})\n${data.urls?.browser}`
  },
  handler: () => import('../handlers/put.ts'),
})
