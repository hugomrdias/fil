import { Cli, z } from 'incur'
import { createApp } from './app.ts'
import { login, logout, parseScopes, status } from './commands/auth.ts'
import {
  get,
  inspect,
  ls,
  opsInspect,
  opsList,
  put,
  remove,
  resume,
} from './commands/storage.ts'
import { NetworkSchema } from './config.ts'
import { guard } from './errors.ts'

/** CLI version reported by `--version`. */
export const VERSION = '0.0.0'

/** Global options shared by every command. */
const globals = z.object({
  network: NetworkSchema.optional().describe(
    'Network (default: FOC_NETWORK, config, then calibration)'
  ),
})

/** Run context fields used to build the app and report progress. */
type RunContext = {
  agent: boolean
  env: unknown
  globals?: unknown
}

/** Build the invocation context from a command's run context. */
function appOf(c: RunContext) {
  const network = (c.globals as { network?: string } | undefined)?.network
  return createApp({
    ...(network ? { network } : {}),
    env: process.env,
  })
}

/** Human progress on stderr; silent for agents and pipes. */
function progressOf(c: RunContext): ((message: string) => void) | undefined {
  if (c.agent) return undefined
  return (message) => {
    process.stderr.write(`› ${message}\n`)
  }
}

/** Shared definition of `put` and its `publish` alias. */
const putArgs = z.object({
  path: z.string().describe('File or directory to store'),
})
const putOptions = z.object({
  name: z.string().optional().describe('Display name (default: basename)'),
  provider: z
    .string()
    .optional()
    .describe('Storage provider ID (default: automatic)'),
})

/** Operation commands: list, inspect, and resume saved jobs. */
const ops = Cli.create('ops', {
  description: 'Inspect and resume saved put and rm jobs',
})
  .command('ls', {
    description: 'List operations, most recent first',
    options: z.object({
      limit: z.number().default(20).describe('Maximum results'),
      incomplete: z
        .boolean()
        .default(false)
        .describe('Only jobs that have not completed'),
    }),
    run(c) {
      return guard(c, async () => opsList(appOf(c), c.options))
    },
  })
  .command('inspect', {
    description: 'Show an operation and its checkpoints',
    args: z.object({ id: z.string().describe('Operation ID') }),
    run(c) {
      return guard(c, async () => opsInspect(appOf(c), c.args.id))
    },
  })
  .command('resume', {
    description: 'Continue an unfinished operation with its saved input',
    args: z.object({ id: z.string().describe('Operation ID') }),
    run(c) {
      return guard(c, () => resume(appOf(c), c.args.id, progressOf(c)))
    },
  })

/**
 * The `foc` command tree.
 *
 * @see ../../../docs/foc-cli-interface-research.md
 * @see https://github.com/wevm/incur
 */
export const cli = Cli.create('foc', {
  version: VERSION,
  description:
    'Store files and folders on Filecoin Onchain Cloud and get Curio links',
  globals,
})
  .command('login', {
    description:
      'Authorize a session key in the pay.filecoin.cloud console and wait for approval',
    options: z.object({
      scopes: z
        .string()
        .optional()
        .describe(
          'Comma-separated scopes (default: createDataSet,addPieces,schedulePieceRemovals)'
        ),
      wait: z
        .boolean()
        .optional()
        .describe('Wait for approval (default: only in a terminal)'),
      open: z.boolean().default(true).describe('Open the console in a browser'),
      fresh: z.boolean().default(false).describe('Always generate a new key'),
      timeout: z.number().default(600).describe('Seconds to wait for approval'),
    }),
    run(c) {
      return guard(c, () =>
        login(appOf(c), {
          scopes: parseScopes(c.options.scopes),
          wait: c.options.wait ?? !c.agent,
          open: c.options.open && !c.agent,
          fresh: c.options.fresh,
          timeoutSeconds: c.options.timeout,
          ...(progressOf(c) ? { progress: progressOf(c) } : {}),
        }).then((result) =>
          c.ok(result, {
            cta: {
              commands: [
                { command: 'status', description: 'Check account readiness' },
              ],
            },
          })
        )
      )
    },
  })
  .command('logout', {
    description:
      'Forget the local session key (revoke it on-chain in the console)',
    run(c) {
      return guard(c, async () => logout(appOf(c)))
    },
  })
  .command('status', {
    description: 'Show the session, scope expiries, and funding readiness',
    run(c) {
      return guard(c, () => status(appOf(c)))
    },
  })
  .command('put', {
    description:
      'Store a file (raw piece) or directory (UnixFS CAR) with one copy',
    aliases: ['publish'],
    args: putArgs,
    options: putOptions,
    run(c) {
      return guard(c, () =>
        put(appOf(c), {
          path: c.args.path,
          ...c.options,
          ...(progressOf(c) ? { progress: progressOf(c) } : {}),
        }).then((result) =>
          c.ok(result, {
            cta: {
              commands: [
                {
                  command: `get ${result.resource.ref}`,
                  description: 'Download and verify',
                },
                {
                  command: `inspect ${result.resource.ref} --check`,
                  description: 'Check retrieval',
                },
              ],
            },
          })
        )
      )
    },
  })
  .command('get', {
    description: 'Download and verify a resource (by ref or PieceCID)',
    args: z.object({
      target: z.string().describe('Resource ref (res_…) or PieceCID'),
    }),
    options: z.object({
      output: z.string().optional().describe('Output path (default: name)'),
      force: z.boolean().default(false).describe('Overwrite an existing file'),
    }),
    alias: { output: 'o' },
    run(c) {
      return guard(c, () =>
        get(appOf(c), { target: c.args.target, ...c.options })
      )
    },
  })
  .command('ls', {
    description: 'List managed resources, newest first',
    options: z.object({
      limit: z.number().default(20).describe('Maximum results'),
      all: z
        .boolean()
        .default(false)
        .describe('Include resources pending removal'),
    }),
    run(c) {
      return guard(c, async () => ls(appOf(c), c.options))
    },
  })
  .command('inspect', {
    description: 'Show a managed resource and its Curio URLs',
    args: z.object({ ref: z.string().describe('Resource ref (res_…)') }),
    options: z.object({
      check: z.boolean().default(false).describe('Probe the retrieval URL'),
    }),
    run(c) {
      return guard(c, () => inspect(appOf(c), c.args.ref, c.options))
    },
  })
  .command('rm', {
    description: 'Schedule removal of a managed resource',
    aliases: ['delete'],
    args: z.object({ ref: z.string().describe('Resource ref (res_…)') }),
    run(c) {
      return guard(c, () => remove(appOf(c), c.args.ref, progressOf(c)))
    },
  })
  .command(ops)
