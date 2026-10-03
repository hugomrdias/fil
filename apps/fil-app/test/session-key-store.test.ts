import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseSessionKeys,
  SessionKeyStore,
  type StoredSessionKey,
  sessionKeyStorageKey,
} from '../src/lib/session-key-store.ts'

/** In-memory Storage stand-in. */
function memory() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    map,
  }
}

const KEY: StoredSessionKey = {
  address: '0x1111111111111111111111111111111111111111',
  privateKey: `0x${'ab'.repeat(32)}`,
  label: 'test',
  createdAt: 1,
}

describe('session key store', () => {
  it('builds storage keys per chain and lowercase root', () => {
    assert.equal(
      sessionKeyStorageKey(314, '0xABCDEF0000000000000000000000000000000000'),
      'fil-app:session-keys:314:0xabcdef0000000000000000000000000000000000'
    )
  })

  it('drops malformed entries', () => {
    assert.deepEqual(parseSessionKeys(null), [])
    assert.deepEqual(parseSessionKeys('not json'), [])
    assert.deepEqual(parseSessionKeys('{}'), [])
    assert.deepEqual(
      parseSessionKeys(
        JSON.stringify([KEY, { ...KEY, privateKey: '0x12' }, { foo: 1 }])
      ),
      [KEY]
    )
  })

  it('upserts, removes and notifies with stable snapshots', () => {
    const storage = memory()
    const store = new SessionKeyStore(storage)
    const key = sessionKeyStorageKey(314, KEY.address)
    let calls = 0
    const unsubscribe = store.subscribe(() => {
      calls++
    })

    assert.equal(store.get(key), store.get(key))
    store.upsert(key, {
      ...KEY,
      address: KEY.address.toUpperCase() as `0x${string}`,
    })
    assert.equal(calls, 1)
    assert.deepEqual(store.get(key), [KEY])
    assert.equal(store.get(key), store.get(key))

    store.upsert(key, { ...KEY, label: 'renamed' })
    assert.equal(store.get(key).length, 1)
    assert.equal(store.get(key)[0]?.label, 'renamed')

    store.remove(key, KEY.address)
    assert.deepEqual(store.get(key), [])
    assert.equal(storage.map.has(key), false)
    assert.equal(calls, 3)

    unsubscribe()
    store.upsert(key, KEY)
    assert.equal(calls, 3)
  })
})
