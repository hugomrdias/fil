import type { PieceCID } from '@filoz/synapse-core/piece'
import * as SP from '@filoz/synapse-core/sp'
import type {
  MetadataObject,
  PdpDataSet,
} from '@filoz/synapse-core/warm-storage'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { useChainId, useConfig, useConnection } from 'wagmi'
import { synapseKeys } from './keys'
import { getSignerClient, type SessionKeySignerOptions } from './utils'

/** Per-file upload stage. */
export type UploadStage =
  | 'queued'
  | 'uploading'
  | 'parking'
  | 'parked'
  | 'adding'
  | 'done'
  | 'error'

/** Progress for one file in {@link useUpload}. */
export interface UploadFileState {
  /** File name. */
  name: string
  /** File size in bytes. */
  size: number
  /** Current stage. */
  stage: UploadStage
  /** Bytes sent to the provider. */
  bytesUploaded: number
  /** PieceCID once computed. */
  pieceCid?: string
  /** Error message when `stage` is `error`. */
  error?: string
}

/** Variables for {@link useUpload}. */
export interface UseUploadVariables {
  /** Target data set. */
  dataSet: PdpDataSet
  /** Files to upload; each becomes one piece. */
  files: File[]
  /**
   * Piece metadata per file; defaults to `{ name, type }`.
   *
   * @param file - The file being uploaded.
   */
  metadata?: (file: File) => MetadataObject
}

/** Result of a completed {@link useUpload} mutation. */
export interface UseUploadResult {
  /** Provider add-pieces confirmation. */
  added: SP.waitForAddPieces.OutputType
  /** Pieces added to the data set, in file order. */
  pieces: UploadedPiece[]
  /** Files that failed to upload and were not added; retry them. */
  failed: { file: File; error: Error }[]
}

/** A piece confirmed on-chain by {@link useUpload}. */
export interface UploadedPiece {
  /** Source file name. */
  file: string
  /** File size in bytes (the piece's raw size). */
  size: number
  /** PieceCID. */
  pieceCid: PieceCID
  /** Piece id in the data set, from the confirmed add-pieces transaction. */
  pieceId: bigint | undefined
  /** Metadata stored with the piece. */
  metadata: MetadataObject
}

/** Props for {@link useUpload}. */
export interface UseUploadProps extends SessionKeySignerOptions {
  /** Called with the add-pieces transaction hash. */
  onHash?: (hash: string) => void
}

/**
 * Upload files to a data set with synapse-core only: stream each file to the
 * provider (computing its PieceCID on the fly), wait for it to be parked,
 * then add every parked piece in one signed request. Files that fail are
 * returned in `failed` so they can be retried. Tracks per-file progress.
 *
 * @param props - {@link UseUploadProps}
 */
export function useUpload(props?: UseUploadProps) {
  const config = useConfig()
  const chainId = useChainId({ config })
  const connection = useConnection({ config })
  const queryClient = useQueryClient()
  const [files, setFiles] = useState<UploadFileState[]>([])
  // Uploads keep running after a run ends; the run id stops a stale run from
  // patching the progress of a newer one.
  const runRef = useRef(0)

  const mutation = useMutation({
    mutationFn: async ({
      dataSet,
      files: inputs,
      metadata,
    }: UseUploadVariables): Promise<UseUploadResult> => {
      if (!dataSet.provider) {
        throw new Error(`Provider ${dataSet.providerId} is unavailable`)
      }
      const run = ++runRef.current
      const update = (
        fn: (prev: UploadFileState[]) => UploadFileState[]
      ): void => {
        if (runRef.current === run) {
          setFiles(fn)
        }
      }
      const patch = (index: number, change: Partial<UploadFileState>) =>
        update((prev) =>
          prev.map((item, i) => (i === index ? { ...item, ...change } : item))
        )
      const serviceURL = dataSet.provider.pdp.serviceURL
      update(() =>
        inputs.map((file) => ({
          name: file.name,
          size: file.size,
          stage: 'queued',
          bytesUploaded: 0,
        }))
      )

      // Settle every upload so one failure doesn't orphan the pieces that
      // were parked successfully.
      const settled = await settleWithLimit(
        inputs,
        UPLOAD_CONCURRENCY,
        async (file, index) => {
          try {
            patch(index, { stage: 'uploading' })
            // Re-render once per whole percent, not once per chunk.
            let percent = -1
            const { pieceCid } = await SP.uploadPieceStreaming({
              serviceURL,
              data: file.stream(),
              size: file.size,
              onProgress: (bytesUploaded) => {
                const next = Math.floor((bytesUploaded / file.size) * 100)
                if (next !== percent) {
                  percent = next
                  patch(index, { bytesUploaded })
                }
              },
            })
            patch(index, {
              stage: 'parking',
              pieceCid: pieceCid.toString(),
              bytesUploaded: file.size,
            })
            await SP.findPiece({ serviceURL, pieceCid, poll: true })
            patch(index, { stage: 'parked' })
            return { file, index, pieceCid }
          } catch (error) {
            patch(index, { stage: 'error', error: toError(error).message })
            throw error
          }
        }
      )
      const uploaded = settled.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : []
      )
      const failed = settled.flatMap((result, index) =>
        result.status === 'rejected'
          ? [{ file: inputs[index], error: toError(result.reason) }]
          : []
      )
      if (uploaded.length === 0) {
        throw failed[0]?.error ?? new Error('Nothing to upload')
      }

      const indexes = new Set(uploaded.map((item) => item.index))
      const setStage = (stage: UploadStage, error?: string) =>
        update((prev) =>
          prev.map((item, i) =>
            indexes.has(i) ? { ...item, stage, error } : item
          )
        )
      setStage('adding')
      const toAdd = uploaded.map(({ file, pieceCid }) => ({
        file,
        pieceCid,
        metadata: metadata?.(file) ?? {
          name: file.name,
          ...(file.type ? { type: file.type } : {}),
        },
      }))
      try {
        const client = await getSignerClient(config, {
          account: connection.address,
          chainId,
          sessionKey: props?.sessionKey,
        })
        const { txHash, statusUrl } = await SP.addPieces(client, {
          serviceURL,
          dataSetId: dataSet.dataSetId,
          clientDataSetId: dataSet.clientDataSetId,
          pieces: toAdd.map(({ pieceCid, metadata }) => ({
            pieceCid,
            metadata,
          })),
        })
        props?.onHash?.(txHash)
        // Polls the provider until the add-pieces transaction is confirmed.
        const added = await SP.waitForAddPieces({ statusUrl })
        setStage('done')
        // More data raises the rail rate, lockup and FWSS allowance usage.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: synapseKeys.dataSets }),
          queryClient.invalidateQueries({ queryKey: synapseKeys.pdpDataSets }),
          queryClient.invalidateQueries({ queryKey: synapseKeys.pdpDataSet }),
          queryClient.invalidateQueries({ queryKey: synapseKeys.storageSize }),
          queryClient.invalidateQueries({ queryKey: synapseKeys.accountInfo }),
          queryClient.invalidateQueries({
            queryKey: synapseKeys.accountSummary,
          }),
          queryClient.invalidateQueries({
            queryKey: synapseKeys.operatorApprovals,
          }),
          queryClient.invalidateQueries({ queryKey: synapseKeys.uploadCosts }),
        ])
        return {
          added,
          // The provider confirms piece ids in submission order.
          pieces: toAdd.map(({ file, pieceCid, metadata }, index) => ({
            file: file.name,
            size: file.size,
            pieceCid,
            pieceId: added.confirmedPieceIds[index],
            metadata,
          })),
          failed,
        }
      } catch (error) {
        setStage('error', toError(error).message)
        throw error
      }
    },
  })

  const resetFiles = useCallback(() => {
    runRef.current++
    setFiles([])
  }, [])

  return {
    ...mutation,
    /** Per-file progress of the current or last upload. */
    files,
    /** Clear progress state and detach any running upload from it. */
    resetFiles,
  }
}

/** Files streamed to the provider at the same time. */
const UPLOAD_CONCURRENCY = 4

/**
 * Like `Promise.allSettled(items.map(fn))`, but runs at most `limit` calls
 * at a time.
 *
 * @param items - Inputs.
 * @param limit - Maximum concurrent calls.
 * @param fn - Async work per item.
 */
async function settleWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      try {
        results[index] = {
          status: 'fulfilled',
          value: await fn(items[index], index),
        }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  )
  return results
}

/**
 * Normalise a thrown value into an Error.
 *
 * @param error - Thrown value.
 */
function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}
