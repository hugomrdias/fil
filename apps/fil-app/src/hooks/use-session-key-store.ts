import { useMemo, useSyncExternalStore } from 'react'
import {
  activeSessionKeyStorageKey,
  SessionKeyStore,
  type StoredSessionKey,
  sessionKeyStorageKey,
} from '@/lib/session-key-store'

const EMPTY: StoredSessionKey[] = []

/** In-memory fallback when localStorage is unavailable. */
function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
  }
}

/** Resolve browser storage, falling back to memory. */
function resolveStorage() {
  try {
    const probe = '__fil-app-probe__'
    localStorage.setItem(probe, probe)
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return memoryStorage()
  }
}

const sessionKeyStore = new SessionKeyStore(resolveStorage())

// One listener for the whole app: changes made in other tabs. The module
// also loads during server rendering, where there is no window.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key.startsWith('fil-app:session-keys')) {
      sessionKeyStore.notify()
    }
  })
}

/**
 * Subscribe a component to the session key store.
 *
 * @param listener - Change callback.
 */
function subscribe(listener: () => void) {
  return sessionKeyStore.subscribe(listener)
}

/**
 * Session keys stored for a root wallet on a chain, and the active one,
 * kept in sync across tabs.
 *
 * @param chainId - EVM chain id.
 * @param root - Root wallet address.
 */
export function useStoredSessionKeys(chainId: number, root: string) {
  const key = sessionKeyStorageKey(chainId, root)
  const activeKey = activeSessionKeyStorageKey(chainId, root)
  const keys = useSyncExternalStore(
    subscribe,
    () => sessionKeyStore.get(key),
    () => EMPTY
  )
  const active = useSyncExternalStore(
    subscribe,
    () => sessionKeyStore.getActive(activeKey),
    () => null
  )

  const actions = useMemo(
    () => ({
      add: (entry: StoredSessionKey) => sessionKeyStore.upsert(key, entry),
      remove: (address: string) => sessionKeyStore.remove(key, address),
      setActive: (address: string | null) =>
        sessionKeyStore.setActive(activeKey, address),
    }),
    [key, activeKey]
  )

  /** `active` is the active session key address, or null for the wallet. */
  return { keys, active, ...actions }
}
