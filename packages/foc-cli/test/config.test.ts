import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { test } from 'node:test'
import { openConfig, resolveNetwork } from '../src/config.ts'
import { tempDir } from './helpers.ts'

test('resolveNetwork prefers input, then config, then calibration', async () => {
  const config = openConfig({ FOC_CONFIG_DIR: await tempDir() })
  assert.equal(resolveNetwork(undefined, config), 'calibration')
  config.set('network', 'mainnet')
  assert.equal(resolveNetwork(undefined, config), 'mainnet')
  assert.equal(resolveNetwork('calibration', config), 'calibration')
})

test('config file is private to the user', async () => {
  const config = openConfig({ FOC_CONFIG_DIR: await tempDir() })
  config.set('sessions.calibration', {
    privateKey: '0x01',
    address: '0x02',
    scopes: ['addPieces'],
    fromBlock: '1',
    createdAt: new Date(0).toISOString(),
  })
  const { mode } = await stat(config.path)
  assert.equal(mode & 0o777, 0o600)
  assert.equal(config.get('sessions.calibration.fromBlock'), '1')
})
