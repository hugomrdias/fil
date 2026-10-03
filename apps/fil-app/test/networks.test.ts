import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CreateDataSetPermission } from '@filoz/synapse-core/session-key'
import {
  isNetwork,
  networkForChainId,
  switchNetworkPath,
  txUrl,
} from '../src/lib/networks.ts'
import { permissionLabel } from '../src/lib/permissions.ts'

describe('networks', () => {
  it('validates network names', () => {
    assert.equal(isNetwork('mainnet'), true)
    assert.equal(isNetwork('calibration'), true)
    assert.equal(isNetwork('devnet'), false)
    assert.equal(isNetwork(undefined), false)
  })

  it('maps chain ids to networks', () => {
    assert.equal(networkForChainId(314), 'mainnet')
    assert.equal(networkForChainId(314159), 'calibration')
    assert.equal(networkForChainId(1), undefined)
  })

  it('swaps the network path segment and keeps the rest', () => {
    assert.equal(
      switchNetworkPath('/mainnet/rails/5', 'calibration'),
      '/calibration/rails/5'
    )
    assert.equal(switchNetworkPath('/dashboard', 'mainnet'), '/mainnet')
    assert.equal(switchNetworkPath('/', 'calibration'), '/calibration')
  })

  it('links to the chain default explorer (Blockscout)', () => {
    assert.equal(
      txUrl('mainnet', '0xabc'),
      'https://filecoin.blockscout.com/tx/0xabc'
    )
    assert.equal(
      txUrl('calibration', '0xabc'),
      'https://filecoin-testnet.blockscout.com/tx/0xabc'
    )
  })

  it('labels session key permissions', () => {
    assert.equal(permissionLabel(CreateDataSetPermission), 'CreateDataSet')
    assert.equal(
      permissionLabel(
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      ),
      '0x000000…000000'
    )
  })
})
