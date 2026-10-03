import type { Permission } from '@filoz/synapse-core/session-key'
import { KeyRoundIcon, WalletIcon } from 'lucide-react'
import { useDashboard } from '@/components/dashboard-context'
import { shortHex } from '@/lib/format'

/**
 * Shows whether an action will be signed by the active session key or the
 * wallet.
 *
 * @param props.permissions - Permissions the action needs.
 */
export function SignerBadge(props: { permissions: Permission[] }) {
  const { signerFor } = useDashboard()
  const signer = signerFor(props.permissions)
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {signer ? (
        <>
          <KeyRoundIcon className="size-3" />
          Signs with session key {shortHex(signer.address)}
        </>
      ) : (
        <>
          <WalletIcon className="size-3" />
          Signs with your wallet
        </>
      )}
    </span>
  )
}
