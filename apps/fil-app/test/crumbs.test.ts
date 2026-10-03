import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { crumbsFor } from '../src/lib/crumbs.ts'

describe('crumbsFor', () => {
  it('has no crumbs on the explorer home', () => {
    assert.deepEqual(crumbsFor('/mainnet'), [])
    assert.deepEqual(crumbsFor('/'), [])
  })

  it('names the dashboard home', () => {
    assert.deepEqual(crumbsFor('/dashboard'), [{ label: 'Dashboard' }])
    assert.deepEqual(crumbsFor('/dashboard/'), [{ label: 'Dashboard' }])
  })

  it('links sections back to the network home', () => {
    assert.deepEqual(crumbsFor('/calibration/rails'), [
      { label: 'Calibration', href: '/calibration' },
      { label: 'Rails' },
    ])
  })

  it('links records to their section list', () => {
    assert.deepEqual(crumbsFor('/mainnet/data-sets/12'), [
      { label: 'Mainnet', href: '/mainnet' },
      { label: 'Data sets', href: '/mainnet/data-sets' },
      { label: 'Data set #12' },
    ])
    assert.deepEqual(crumbsFor('/dashboard/data-sets/3/'), [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Data sets', href: '/dashboard/data-sets' },
      { label: 'Data set #3' },
    ])
  })

  it('skips the list crumb for sections without a list page', () => {
    assert.deepEqual(
      crumbsFor('/mainnet/address/0x480c51fe9fc90e01fa742c51300cc29e151a71cd'),
      [{ label: 'Mainnet', href: '/mainnet' }, { label: '0x480c…71cd' }]
    )
  })

  it('ignores unknown roots', () => {
    assert.deepEqual(crumbsFor('/nope/rails'), [])
  })
})
