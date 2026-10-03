import { PermissionNames } from '@filoz/synapse-core/session-key'
import { shortHex } from './format.ts'

/**
 * Human label for an FWSS session key permission typehash.
 *
 * @param permission - EIP-712 typehash.
 */
export function permissionLabel(permission: string) {
  return (
    (PermissionNames as Record<string, string>)[permission] ??
    shortHex(permission, 6)
  )
}
