import { getChain } from '@filoz/synapse-core/chains'
import { getTransport } from '@filoz/synapse-core/client'
import {
  DefaultEmptyExpirations,
  type Expirations,
  fromSecp256k1,
  type Permission,
} from '@filoz/synapse-core/session-key'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Address, Hex } from 'viem'
import { useChainId, useConfig } from 'wagmi'
import type { Secp256k1SessionKey } from './utils'

/** Props for {@link useSessionKey}. */
export interface UseSessionKeyProps {
  /** Session key private key; the hook is idle when omitted. */
  privateKey?: Hex | null
  /** Root wallet address that authorized the key. */
  root?: Address | null
  /** Chain id; defaults to the connected chain. */
  chainId?: number
  /**
   * Keep expirations in sync by watching `AuthorizationsUpdated` events.
   * @default true
   */
  watch?: boolean
}

/** Result of {@link useSessionKey}. */
export interface UseSessionKeyResult {
  /** The session key, ready to pass as `sessionKey` to write hooks. */
  sessionKey: Secp256k1SessionKey | null
  /** Latest known per-permission expiries (Unix seconds). */
  expirations: Expirations
  /** Whether every permission is currently unexpired. */
  hasPermissions: (permissions: Permission[]) => boolean
  /** Whether the initial expiration sync is running. */
  isSyncing: boolean
  /** Last sync or watch error. */
  error: Error | null
}

/**
 * Build a secp256k1 session key client for a root wallet and keep its
 * permission expirations in sync with the SessionKeyRegistry.
 *
 * @param props - {@link UseSessionKeyProps}
 * @see https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-core/src/session-key
 */
export function useSessionKey(props: UseSessionKeyProps): UseSessionKeyResult {
  const config = useConfig()
  const connectedChainId = useChainId({ config })
  const chainId = props.chainId ?? connectedChainId
  const watch = props.watch ?? true
  const { privateKey, root } = props

  const sessionKey = useMemo(() => {
    if (!(privateKey && root)) {
      return null
    }
    const chain = getChain(chainId)
    return fromSecp256k1({
      privateKey,
      root,
      chain,
      transport: getTransport(chain) as Parameters<
        typeof fromSecp256k1
      >[0]['transport'],
    })
  }, [privateKey, root, chainId])

  const [expirations, setExpirations] = useState<Expirations>(
    DefaultEmptyExpirations
  )
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!sessionKey) {
      setExpirations(DefaultEmptyExpirations)
      return
    }
    let cancelled = false
    const onUpdate = (event: CustomEvent<Expirations>) => {
      if (!cancelled) {
        setExpirations({ ...event.detail })
      }
    }
    const onError = (event: CustomEvent<Error>) => {
      if (!cancelled) {
        setError(event.detail)
      }
    }
    sessionKey.addEventListener('expirationsUpdated', onUpdate)
    sessionKey.addEventListener('error', onError)
    setIsSyncing(true)
    setError(null)
    const start = watch ? sessionKey.watch() : sessionKey.syncExpirations()
    start
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSyncing(false)
        }
      })
    return () => {
      cancelled = true
      sessionKey.removeEventListener('expirationsUpdated', onUpdate)
      sessionKey.removeEventListener('error', onError)
      sessionKey.unwatch()
    }
  }, [sessionKey, watch])

  // `expirations` mirrors the key's internal expiry state, so it must
  // refresh the callback even though the body reads the key instead.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  const hasPermissions = useCallback(
    (permissions: Permission[]) =>
      sessionKey?.hasPermissions(permissions) ?? false,
    [sessionKey, expirations]
  )

  return { sessionKey, expirations, hasPermissions, isSyncing, error }
}
