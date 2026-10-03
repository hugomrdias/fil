import { TerminateServicePermission } from '@filoz/synapse-core/session-key'
import type { PdpDataSet } from '@filoz/synapse-core/warm-storage'
import { useDashboard } from '@/components/dashboard-context'
import { SignerBadge } from '@/components/signer-badge'
import { StatusBadge } from '@/components/status-badge'
import { txToasts } from '@/components/tx-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useTerminateDataSet } from '@/hooks-synapse'

/**
 * Status of an on-chain data set.
 *
 * @param props.dataSet - Data set.
 */
export function PdpDataSetStatus(props: { dataSet: PdpDataSet }) {
  if (!props.dataSet.live) {
    return <StatusBadge tone="neutral">Deleted</StatusBadge>
  }
  if (props.dataSet.pdpEndEpoch > 0n) {
    return (
      <StatusBadge tone="warning">
        Terminating at {props.dataSet.pdpEndEpoch.toString()}
      </StatusBadge>
    )
  }
  return <StatusBadge tone="success">Live</StatusBadge>
}

/**
 * Confirm-and-terminate button for a data set.
 *
 * @param props.dataSet - Data set to terminate.
 */
export function TerminateDataSetButton(props: { dataSet: PdpDataSet }) {
  const { network, signerFor } = useDashboard()
  const terminate = useTerminateDataSet({
    sessionKey: signerFor([TerminateServicePermission]),
    ...txToasts(network, `Terminate data set #${props.dataSet.dataSetId}`),
  })
  const disabled =
    !props.dataSet.live ||
    props.dataSet.pdpEndEpoch > 0n ||
    !props.dataSet.provider ||
    terminate.isPending
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button disabled={disabled} size="sm" variant="destructive" />}
      >
        Terminate
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Terminate data set #{props.dataSet.dataSetId.toString()}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Storage service ends after the lockup period and the provider stops
            proving these pieces. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <SignerBadge permissions={[TerminateServicePermission]} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => terminate.mutate({ dataSet: props.dataSet })}
          >
            Terminate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
