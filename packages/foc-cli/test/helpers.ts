import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after } from 'node:test'

/**
 * Create a temporary directory removed after the current test file.
 */
export async function tempDir(prefix = 'foc-test-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  after(() => rm(dir, { recursive: true, force: true }))
  return dir
}
