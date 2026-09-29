import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { CarIndexer } from '@ipld/car'
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

/** Count the blocks in a CAR file. */
async function countBlocks(carPath: string): Promise<number> {
  const indexer = await CarIndexer.fromIterable(createReadStream(carPath))
  let count = 0
  for await (const _ of indexer) count++
  return count
}

test('packDirectory writes no orphan directory blocks', async () => {
  const root = await tempDir()
  const dir = join(root, 'site')
  await mkdir(join(dir, 'assets', 'img'), { recursive: true })
  await writeFile(join(dir, 'index.html'), '<h1>hello</h1>')
  // 2.5 MB → three 1 MiB-max raw leaves plus one file node.
  await writeFile(join(dir, 'assets', 'img', 'big.bin'), randomBytes(2_500_000))
  const car = join(root, 'site.car')
  await packDirectory(dir, car)
  // 3 directories + index.html + 4 blocks for big.bin
  assert.equal(await countBlocks(car), 8)
})

test('packDirectory keeps empty directories, including an empty root', async () => {
  const root = await tempDir()
  const dir = join(root, 'blank')
  await mkdir(join(dir, 'nested', 'deeper'), { recursive: true })
  const packed = await packDirectory(dir, join(root, 'blank.car'))
  assert.equal(packed.files, 0)
  const out = join(root, 'out')
  await extractCar(join(root, 'blank.car'), out)
  const entries = await listEntries(out)
  assert.deepEqual(entries.directories, ['nested', 'nested/deeper'])

  const empty = join(root, 'empty')
  await mkdir(empty)
  const packedEmpty = await packDirectory(empty, join(root, 'empty.car'))
  assert.equal(await countBlocks(join(root, 'empty.car')), 1)
  assert.ok(packedEmpty.rootCid)
})

test('extractCar rejects a block that does not match its CID', async () => {
  const root = await tempDir()
  const dir = await site(root)
  const car = join(root, 'site.car')
  const packed = await packDirectory(dir, car)
  // Flip a byte inside big.bin's data, well past the header.
  const handle = await open(car, 'r+')
  try {
    const offset = Math.floor(packed.size / 2)
    const byte = Buffer.alloc(1)
    await handle.read(byte, 0, 1, offset)
    byte[0] = (byte[0] ?? 0) ^ 0xff
    await handle.write(byte, 0, 1, offset)
  } finally {
    await handle.close()
  }
  await assert.rejects(extractCar(car, join(root, 'out')), {
    code: 'INTEGRITY_ERROR',
  })
})
