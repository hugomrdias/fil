import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { extractCar, listEntries, packDirectory } from '../src/storage/pack.ts'
import { tempDir } from './helpers.ts'

/** Create a small site with nested assets, a dotfile, and an empty dir. */
async function site(root: string): Promise<string> {
  const dir = join(root, 'site')
  await mkdir(join(dir, 'assets', 'img'), { recursive: true })
  await mkdir(join(dir, 'empty'))
  await writeFile(join(dir, 'index.html'), '<h1>hello</h1>')
  await writeFile(join(dir, 'assets', 'img', 'big.bin'), randomBytes(2_500_000))
  await writeFile(join(dir, '.env'), 'SECRET=1')
  return dir
}

test('packDirectory is deterministic and extractCar restores the tree', async () => {
  const root = await tempDir()
  const dir = await site(root)
  const a = await packDirectory(dir, join(root, 'a.car'))
  const b = await packDirectory(dir, join(root, 'b.car'))
  assert.equal(a.rootCid.toString(), b.rootCid.toString())
  assert.equal(a.files, 2)

  const out = join(root, 'out')
  const extracted = await extractCar(join(root, 'a.car'), out)
  assert.equal(extracted.rootCid.toString(), a.rootCid.toString())
  assert.equal(extracted.files, 2)
  assert.deepEqual(
    await readFile(join(out, 'assets', 'img', 'big.bin')),
    await readFile(join(dir, 'assets', 'img', 'big.bin'))
  )
  assert.equal(
    await readFile(join(out, 'index.html'), 'utf8'),
    '<h1>hello</h1>'
  )
  await assert.rejects(readFile(join(out, '.env')), { code: 'ENOENT' })
})

test('listEntries skips dotfiles and rejects symlinks', async () => {
  const root = await tempDir()
  const dir = await site(root)
  const entries = await listEntries(dir)
  assert.deepEqual(
    entries.files.map((f) => f.path),
    ['assets/img/big.bin', 'index.html']
  )
  assert.deepEqual(entries.directories, ['assets', 'assets/img', 'empty'])

  await symlink('/etc/hosts', join(dir, 'hosts'))
  await assert.rejects(listEntries(dir), { code: 'UNSUPPORTED_ENTRY' })
})
