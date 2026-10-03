import type { Expirations, Permission } from '@filoz/synapse-core/session-key'
import { createContext, useContext } from 'react'
import type { Address } from 'viem'
import type { Secp256k1SessionKey } from '@/hooks-synapse'
import type { Network } from '@/lib/networks'
import type { StoredSessionKey } from '@/lib/session-key-store'

/** Values shared by every dashboard page. */
export interface DashboardContextValue {
  /** Connected root wallet. */
  address: Address
  /** Connected chain id. */
  chainId: number
  /** Network of the connected chain. */
  network: Network
  /** Session keys stored in this browser for the wallet. */
  storedKeys: StoredSessionKey[]
  /** Store a session key in this browser (replaces one with the address). */
  addKey: (entry: StoredSessionKey) => void
  /** Delete a stored session key by address. */
  removeKey: (address: string) => void
  /** Active stored session key, if any. */
  activeKey: StoredSessionKey | null
  /** Select the active session key (null signs with the wallet). */
  setActiveKey: (address: string | null) => void
  /** Active session key client with synced expirations. */
  sessionKey: Secp256k1SessionKey | null
  /** Live expirations of the active key; null while syncing or idle. */
  activeExpirations: Expirations | null
  /**
   * Session key to sign with when it holds every permission, else null so
   * the wallet signs.
   *
   * @param permissions - Permissions the action needs.
   */
  signerFor: (permissions: Permission[]) => Secp256k1SessionKey | null
}

/** Dashboard context; only available under `/dashboard`. */
export const DashboardContext = createContext<DashboardContextValue | null>(
  null
)

/** Read the dashboard context. */
export function useDashboard() {
  const value = useContext(DashboardContext)
  if (!value) {
    throw new Error('useDashboard must be used under the dashboard layout')
  }
  return value
}
