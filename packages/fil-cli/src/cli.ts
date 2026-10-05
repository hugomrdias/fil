import { defineCli } from 'clipact'
import pkg from '../package.json' with { type: 'json' }
import { commands } from './commands/index.ts'
import { errors } from './errors.ts'

/**
 * The `fil` CLI. This module and the definitions it imports load only zod and
 * clipact, so `--help`, `--version`, and `schema` never load an SDK; each
 * handler is imported when its command runs.
 *
 * @see ../../../docs/agent-cli/framework-design.md
 * @see ../../../docs/fil-cli/interface-research.md
 */
export const cli = defineCli({
  name: 'fil',
  version: pkg.version,
  description:
    'Store files and folders on Filecoin Onchain Cloud and get Curio links',
  envPrefix: 'FIL',
  commands,
  aliases: { publish: 'put', rm: 'delete' },
  skills: new URL('../skills/', import.meta.url),
  mapError: () => import('./map-error.ts'),
  errors,
})
