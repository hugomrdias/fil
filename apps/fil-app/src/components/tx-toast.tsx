import { toast } from 'sonner'
import { type Network, txUrl } from '@/lib/networks'

/** Options for {@link txToasts}. */
export interface TxToastOptions<T> {
  /**
   * Success title; defaults to `<label> confirmed`.
   *
   * @param data - Mutation result.
   */
  successTitle?: (data: T) => string
  /**
   * Extra work after the success toast, e.g. closing a dialog.
   *
   * @param data - Mutation result.
   */
  onSuccess?: (data: T) => void
}

/**
 * Toast wiring for a write hook: a pending toast with an explorer link on
 * hash, then success or error. Returns `{ onHash, mutation }` to spread into
 * synapse write hook props. Writes with the same label share one toast.
 *
 * @param network - Network for explorer links.
 * @param label - Action label, e.g. `Deposit`.
 * @param options - {@link TxToastOptions}
 * @see https://sonner.emilkowal.ski/
 */
export function txToasts<T = unknown>(
  network: Network,
  label: string,
  options: TxToastOptions<T> = {}
) {
  // A stable id, because a pending mutation calls the callbacks of the latest
  // render, which belong to a newer txToasts() than the one that saw the hash.
  const id = `tx:${label}`
  const success = (title: string) =>
    toast.success(title, { id, description: undefined })
  return {
    onHash: (hash: string) => {
      toast.loading(`${label} submitted`, {
        id,
        description: 'Waiting for confirmation…',
        action: {
          label: 'View',
          onClick: () =>
            window.open(txUrl(network, hash), '_blank', 'noopener'),
        },
      })
    },
    mutation: {
      onSuccess: (data: T) => {
        success(options.successTitle?.(data) ?? `${label} confirmed`)
        options.onSuccess?.(data)
      },
      onError: (error: Error) => {
        toast.error(`${label} failed`, {
          id,
          description: error.message.split('\n')[0],
        })
      },
    },
    /**
     * Replace the pending toast with a custom success title.
     *
     * @param title - Success title.
     */
    success,
    /**
     * Replace the pending toast with a warning.
     *
     * @param title - Warning title.
     * @param description - Details.
     */
    warning: (title: string, description: string) =>
      toast.warning(title, { id, description }),
  }
}
