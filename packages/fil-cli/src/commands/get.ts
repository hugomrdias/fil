import { defineCommand } from 'clipact'
import * as z from 'zod'
import { ErrorCodes } from '../errors.ts'
import { account, accountEnv, formatBytes } from './shared.ts'

/**
 * `fil get <target>`: download a resource (or any PieceCID) from Curio and
 * verify it. Files are written as-is; artifacts are extracted.
 */
export const get = defineCommand({
  name: 'get',
  description: 'Download and verify a resource (by ref or PieceCID)',
  examples: ['fil get res_abc123', 'fil get res_abc123 --output ./copy'],
  input: z.strictObject({
    target: z.string().describe('Resource ref (res_…), PieceCID, or root CID'),
    output: z
      .string()
      .optional()
      .describe('Output path (default: the resource name)'),
    force: z.boolean().default(false).describe('Overwrite an existing file'),
    ...account,
  }),
  positionals: ['target'],
  env: accountEnv,
  secrets: ['sessionKey'],
  output: z.object({
    kind: z.enum(['file', 'artifact']),
    ref: z.string().optional(),
    pieceCid: z.string(),
    output: z.string().describe('Written file or directory'),
    size: z.number().int().describe('Verified bytes downloaded'),
    files: z.number().int().optional().describe('Files extracted'),
    url: z.string(),
  }),
  errors: [
    ErrorCodes.authRequired,
    ErrorCodes.loginPending,
    ErrorCodes.notFound,
    ErrorCodes.outputExists,
    ErrorCodes.verificationFailed,
    ErrorCodes.unsafePath,
  ],
  idempotent: true,
  human: (data) =>
    `Wrote ${data.output} (${formatBytes(data.size)}${data.files == null ? '' : `, ${data.files} files`}), verified against ${data.pieceCid}`,
  handler: () => import('../handlers/get.ts'),
})
