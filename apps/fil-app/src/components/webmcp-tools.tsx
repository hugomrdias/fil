import { useNavigate } from '@tanstack/react-router'
import { useConnection } from 'wagmi'
import { useWebMcpTool } from '@/hooks/use-webmcp-tool'
import { NETWORKS, networkForChainId } from '@/lib/networks'
import {
  DEFAULT_DAYS,
  DEFAULT_NAME,
  MAX_DAYS,
  MAX_NAME_LENGTH,
  SCOPE_IDS,
  type SetupRequest,
  toSetupSearch,
} from '@/lib/setup-request'

/**
 * WebMCP tools available on every page. `prepare_setup_request` fills the
 * setup page for the user to review; it never signs or sends anything.
 * Tools that read page state register on their own pages.
 *
 * @see https://webmachinelearning.github.io/webmcp/
 */
export function WebMcpTools() {
  const navigate = useNavigate()
  const connection = useConnection()

  useWebMcpTool<SetupRequest>({
    name: 'prepare_setup_request',
    description:
      "Open fil-app's setup page prefilled for the wallet owner to review: authorize a session key (for example the address that `fil login` printed), approve Warm Storage, and deposit USDFC into Filecoin Pay. Nothing is signed or sent. The user reviews the page and approves each step in their wallet. After calling this, ask the user to review the page, then call get_setup_status to check.",
    inputSchema: {
      type: 'object',
      properties: {
        network: {
          type: 'string',
          enum: [...NETWORKS],
          description: 'Network the request is for.',
        },
        signer: {
          type: 'string',
          description:
            'Session-key address to authorize, as 0x-prefixed hex. Omit to only approve Warm Storage or deposit.',
        },
        name: {
          type: 'string',
          maxLength: MAX_NAME_LENGTH,
          description: `Session-key name, recorded on chain so the owner can recognise the key. Default: "${DEFAULT_NAME}".`,
        },
        scopes: {
          type: 'array',
          items: { type: 'string', enum: [...SCOPE_IDS] },
          description:
            'Permissions to request for the session key. Default: createDataSet, addPieces, schedulePieceRemovals.',
        },
        days: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_DAYS,
          description: `Days until the authorization expires. Default: ${DEFAULT_DAYS}.`,
        },
        deposit: {
          type: 'string',
          description:
            'USDFC to deposit into Filecoin Pay, as a decimal amount such as "1.5".',
        },
      },
    },
    execute: async (input) => {
      const result = toSetupSearch(input)
      if ('errors' in result) {
        return { ok: false, errors: result.errors }
      }
      await navigate({ to: '/dashboard/setup', search: result.search })
      const network =
        connection.status === 'connected'
          ? networkForChainId(connection.chainId)
          : undefined
      return {
        ok: true,
        url: window.location.href,
        walletConnected: connection.status === 'connected',
        walletNetwork: network ?? null,
        nextStep:
          connection.status === 'connected'
            ? 'Ask the user to review the setup page and approve each step in their wallet.'
            : 'Ask the user to connect their wallet on the setup page, then review and approve each step.',
      }
    },
  })

  return null
}
