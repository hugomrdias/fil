import type { SessionKey } from '@filoz/synapse-core/session-key'
import type { Config } from 'wagmi'
import { getConnectorClient } from 'wagmi/actions'

/** A Synapse session key backed by a secp256k1 private key. */
export type Secp256k1SessionKey = SessionKey<'Secp256k1'>

/** Options shared by write hooks that can sign with a session key. */
export interface SessionKeySignerOptions {
  /**
   * Session key to sign SP (EIP-712) operations with. The connected wallet
   * signs when omitted.
   */
  sessionKey?: Secp256k1SessionKey | null
}

/**
 * Resolve the client that signs a write: the session key client when given,
 * otherwise the connected wallet's connector client.
 *
 * @param config - wagmi config.
 * @param options - Account, chain id and optional session key.
 * @see https://wagmi.sh/core/api/actions/getConnectorClient
 */
export async function getSignerClient(
  config: Config,
  options: {
    account: `0x${string}` | undefined
    chainId: number
    sessionKey?: Secp256k1SessionKey | null
  }
) {
  if (options.sessionKey) {
    if (options.sessionKey.client.chain.id !== options.chainId) {
      throw new Error('Session key is for a different chain')
    }
    return options.sessionKey.client
  }
  return await getConnectorClient(config, {
    account: options.account,
    chainId: options.chainId,
  })
}
