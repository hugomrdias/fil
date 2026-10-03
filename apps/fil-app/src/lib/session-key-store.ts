import { isAddress, isHex } from 'viem'

/** A session key kept in browser storage. */
export interface StoredSessionKey {
  /** Session key address (lowercase). */
  address: `0x${string}`
  /** Secp256k1 private key. */
  privateKey: `0x${string}`
  /** User label. */
  label: string
  /** Creation time in Unix milliseconds. */
  createdAt: number
}

/** Minimal Storage interface so tests can inject an in-memory store. */
export type KeyValueStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>

const PREFIX = 'fil-app:session-keys'

/**
 * Whether a value is a 32-byte hex private key.
 *
 * @param value - Candidate value.
 * @see https://viem.sh/docs/utilities/isHex
 */
export function isPrivateKey(value: unknown): value is `0x${string}` {
  return isHex(value, { strict: true }) && value.length === 66
}

/**
 * Storage key for the session keys of a root wallet on a chain.
 *
 * @param chainId - EVM chain id.
 * @param root - Root wallet address.
 */
export function sessionKeyStorageKey(chainId: number, root: string) {
  return `${PREFIX}:${chainId}:${root.toLowerCase()}`
}

/**
 * Storage key for the active (signing) session key of a root wallet.
 *
 * @param chainId - EVM chain id.
 * @param root - Root wallet address.
 */
export function activeSessionKeyStorageKey(chainId: number, root: string) {
  return `${PREFIX}:active:${chainId}:${root.toLowerCase()}`
}

/**
 * Parse stored session keys, dropping malformed entries.
 *
 * @param raw - JSON string from storage.
 */
export function parseSessionKeys(raw: string | null): StoredSessionKey[] {
  if (!raw) {
    return []
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(
    (item): item is StoredSessionKey =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.address === 'string' &&
      isAddress(item.address, { strict: false }) &&
      isPrivateKey(item.privateKey) &&
      typeof item.label === 'string' &&
      typeof item.createdAt === 'number'
  )
}

/**
 * Small observable store for the session keys of one root wallet.
 *
 * @see https://react.dev/reference/react/useSyncExternalStore
 */
export class SessionKeyStore {
  #storage: KeyValueStorage
  #listeners = new Set<() => void>()
  #cache = new Map<string, { raw: string | null; keys: StoredSessionKey[] }>()

  /**
   * @param storage - Backing storage, usually `localStorage`.
   */
  constructor(storage: KeyValueStorage) {
    this.#storage = storage
  }

  /**
   * Read keys with a stable array identity while storage is unchanged.
   *
   * @param key - Storage key from {@link sessionKeyStorageKey}.
   */
  get(key: string): StoredSessionKey[] {
    const raw = this.#storage.getItem(key)
    const cached = this.#cache.get(key)
    if (cached && cached.raw === raw) {
      return cached.keys
    }
    const keys = parseSessionKeys(raw)
    this.#cache.set(key, { raw, keys })
    return keys
  }

  /**
   * Add or replace a key, matched by address.
   *
   * @param key - Storage key.
   * @param entry - Session key to store.
   */
  upsert(key: string, entry: StoredSessionKey) {
    const address = entry.address.toLowerCase() as `0x${string}`
    const others = this.get(key).filter((item) => item.address !== address)
    this.#write(key, [...others, { ...entry, address }])
  }

  /**
   * Remove a key by address.
   *
   * @param key - Storage key.
   * @param address - Session key address.
   */
  remove(key: string, address: string) {
    const lower = address.toLowerCase()
    this.#write(
      key,
      this.get(key).filter((item) => item.address !== lower)
    )
  }

  /**
   * Read the active session key address.
   *
   * @param key - Storage key from {@link activeSessionKeyStorageKey}.
   */
  getActive(key: string): string | null {
    return this.#storage.getItem(key)
  }

  /**
   * Set or clear the active session key address.
   *
   * @param key - Storage key from {@link activeSessionKeyStorageKey}.
   * @param address - Session key address, or null to sign with the wallet.
   */
  setActive(key: string, address: string | null) {
    if (address) {
      this.#storage.setItem(key, address.toLowerCase())
    } else {
      this.#storage.removeItem(key)
    }
    this.notify()
  }

  /**
   * Subscribe to changes made through this store.
   *
   * @param listener - Change callback.
   * @returns Unsubscribe function.
   */
  subscribe(listener: () => void) {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Notify subscribers, e.g. after a cross-tab `storage` event. */
  notify() {
    for (const listener of this.#listeners) {
      listener()
    }
  }

  #write(key: string, keys: StoredSessionKey[]) {
    if (keys.length === 0) {
      this.#storage.removeItem(key)
    } else {
      this.#storage.setItem(key, JSON.stringify(keys))
    }
    this.notify()
  }
}
