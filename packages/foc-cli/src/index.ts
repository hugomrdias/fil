#!/usr/bin/env node
import { cli } from './cli.ts'

export { cli } from './cli.ts'

if (import.meta.main) {
  await cli.serve()
}
