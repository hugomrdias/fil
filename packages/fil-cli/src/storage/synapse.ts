import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import * as PDPVerifier from '@filoz/synapse-core/pdp-verifier'
import * as Piece from '@filoz/synapse-core/piece'
import * as SP from '@filoz/synapse-core/sp'
import * as SPRegistry from '@filoz/synapse-core/sp-registry'
import {
  signAddPieces,
  signCreateDataSetAndAddPieces,
} from '@filoz/synapse-core/typed-data'
import {
  datasetMetadataObjectToEntry,
  pieceMetadataObjectToEntry,
  randU256,
} from '@filoz/synapse-core/utils'
import * as WarmStorage from '@filoz/synapse-core/warm-storage'
import { CliError } from 'clipact'
import { readContract, waitForTransactionReceipt } from 'viem/actions'
import type { App } from '../app.ts'
import { buildFundingUrl } from '../auth/login.ts'
import type { SessionKey } from '../auth/session.ts'
import { abortable, ErrorCodes, notFound } from '../errors.ts'
import type { Placement, StorageBackend } from './types.ts'

/** Low 128 bits of a `clientNonces` value: the data set ID. */
const LOW_128 = (1n << 128n) - 1n

/**
 * Names of synapse-core errors for a provider-reported failed transaction.
 * Matched by name: `WaitForCreateDataSetRejectedError` inherits a static
 * `is()` that only matches the base `SynapseError`.
 */
const REJECTED_ERRORS = new Set([
  'WaitForAddPiecesRejectedError',
  'WaitForCreateDataSetRejectedError',
])

/**
 * Create the synapse-core storage backend: one copy on one Curio provider,
 * signed by the session key and paid for by its root wallet. Chain reads are
 * cancelled by `app.transport`; provider calls that take no signal are
 * wrapped with {@link abortable} on `app.signal`.
 *
 * @see https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-core
 */
export function createSynapseBackend(
  app: App,
  sessionKey: SessionKey
): StorageBackend {
  const client = app.client
  const signer = sessionKey.client
  const payer = sessionKey.rootAddress
  const signal = app.signal
  const dataSets = new Map<
    bigint,
    ReturnType<typeof WarmStorage.getPdpDataSet>
  >()

  /**
   * Read a data set once per invocation; placement and quote share it. A
   * failed read is forgotten so the next call tries again.
   */
  function getDataSet(dataSetId: bigint) {
    let dataSet = dataSets.get(dataSetId)
    if (!dataSet) {
      dataSet = WarmStorage.getPdpDataSet(client, { dataSetId })
      dataSet.catch(() => dataSets.delete(dataSetId))
      dataSets.set(dataSetId, dataSet)
    }
    return dataSet
  }

  /** Whether a provider answers its PDP ping. */
  async function isReachable(serviceURL: string): Promise<boolean> {
    try {
      await SP.ping(serviceURL)
      return true
    } catch {
      return false
    }
  }

  return {
    async selectPlacement({ metadata, providerId }) {
      const [input, provider] = await Promise.all([
        WarmStorage.fetchProviderSelectionInput(client, { address: payer }),
        providerId == null
          ? undefined
          : SPRegistry.getPDPProvider(client, { providerId }),
      ])
      if (providerId != null) {
        if (!provider) {
          throw notFound(`Provider ${providerId} has no active PDP offering.`)
        }
        const matches = WarmStorage.findMatchingDataSets(
          input.clientDataSets.filter((ds) => ds.providerId === providerId),
          metadata,
          input.legacyPieceStorageIdLimit
        )
        return withDataSet({
          providerId,
          serviceURL: provider.pdp.serviceURL,
          payee: provider.payee,
          dataSetId: matches[0]?.dataSetId,
        })
      }
      const excluded: bigint[] = []
      for (;;) {
        const [location] = WarmStorage.selectProviders({
          ...input,
          count: 1,
          metadata,
          excludeProviderIds: excluded,
        })
        if (!location) {
          throw new CliError({
            code: 'service_unavailable',
            message: 'No reachable storage provider is available.',
          })
        }
        const candidate = location.provider
        if (await abortable(isReachable(candidate.pdp.serviceURL), signal)) {
          return withDataSet({
            providerId: candidate.id,
            serviceURL: candidate.pdp.serviceURL,
            payee: candidate.payee,
            dataSetId: location.dataSetId ?? undefined,
          })
        }
        excluded.push(candidate.id)
      }
    },

    async quote({ size, placement }) {
      const existing =
        placement.dataSetId == null
          ? undefined
          : await existingDataSetCosts(placement.dataSetId)
      const costs = await WarmStorage.getUploadCosts(client, {
        clientAddress: payer,
        pieceSizes: [BigInt(size)],
        isNewDataSet: existing == null,
        ...existing,
      })
      return {
        ready: costs.ready,
        depositNeeded: costs.depositNeeded,
        needsApproval: costs.needsFwssMaxApproval,
        ratePerMonth: costs.rates.perMonth,
        lockup: costs.lockups.total,
        fundingUrl: buildFundingUrl({
          consoleUrl: app.consoleUrl,
          network: app.network,
          deposit: costs.depositNeeded,
        }),
      }
    },

    async hasPiece({ serviceURL, pieceCid }) {
      try {
        await SP.findPiece({
          serviceURL,
          pieceCid: Piece.from(pieceCid),
          signal,
        })
        return true
      } catch (error) {
        if (signal?.aborted) throw error
        return false
      }
    },

    async upload({ serviceURL, path, size, pieceCid }) {
      const cid = Piece.from(pieceCid)
      await SP.uploadPieceStreaming({
        serviceURL,
        data: Readable.toWeb(createReadStream(path)) as ReadableStream,
        size,
        pieceCid: cid,
        signal,
      })
      await SP.findPiece({ serviceURL, pieceCid: cid, poll: true, signal })
    },

    async signCommit({ placement, pieceCid, metadata, pieceMetadata }) {
      const nonce = randU256()
      const pieces = [
        {
          pieceCid: Piece.from(pieceCid),
          metadata: pieceMetadataObjectToEntry(pieceMetadata),
        },
      ]
      if (placement.dataSetId == null) {
        const clientDataSetId = randU256()
        const extraData = await signCreateDataSetAndAddPieces(signer, {
          clientDataSetId,
          nonce,
          // FWSS verifies the signature against the registry payee.
          payee: placement.payee,
          // Without this the session key address would be the payer.
          payer,
          metadata: datasetMetadataObjectToEntry(metadata, { cdn: false }),
          pieces,
        })
        return {
          created: true,
          nonce: nonce.toString(),
          clientDataSetId: clientDataSetId.toString(),
          extraData,
        }
      }
      if (placement.clientDataSetId == null) {
        throw new Error('Adding to a data set requires its client data set ID.')
      }
      const extraData = await signAddPieces(signer, {
        clientDataSetId: placement.clientDataSetId,
        nonce,
        pieces,
      })
      return { created: false, nonce: nonce.toString(), extraData }
    },

    async submitCommit({ placement, pieceCid, commit, pieceMetadata }) {
      const pieces = [
        { pieceCid: Piece.from(pieceCid), metadata: pieceMetadata },
      ]
      // Never start a paid mutation once the user has interrupted.
      signal?.throwIfAborted()
      if (commit.created) {
        const result = await abortable(
          SP.createDataSetAndAddPieces(signer, {
            serviceURL: placement.serviceURL,
            payee: placement.payee,
            payer,
            pieces,
            extraData: commit.extraData,
          }),
          signal
        )
        return { transactionHash: result.txHash, statusUrl: result.statusUrl }
      }
      if (placement.dataSetId == null || placement.clientDataSetId == null) {
        throw new Error('Adding to a data set requires its IDs.')
      }
      const result = await abortable(
        SP.addPieces(signer, {
          serviceURL: placement.serviceURL,
          dataSetId: placement.dataSetId,
          clientDataSetId: placement.clientDataSetId,
          pieces,
          extraData: commit.extraData,
        }),
        signal
      )
      return { transactionHash: result.txHash, statusUrl: result.statusUrl }
    },

    async findCommit({ nonce }) {
      // FWSS stores ((firstAdded + count) << 128) | dataSetId for each used
      // add-pieces nonce, including the add half of create-and-add.
      const value = await readContract(client, {
        address: client.chain.contracts.fwssView.address,
        abi: client.chain.contracts.fwssView.abi,
        functionName: 'clientNonces',
        args: [payer, nonce],
      })
      if (value === 0n) return undefined
      return { dataSetId: value & LOW_128, pieceId: (value >> 128n) - 1n }
    },

    async waitForCommit({ statusUrl, created }) {
      try {
        if (created) {
          const result = await abortable(
            SP.waitForCreateDataSetAddPieces({ statusUrl }),
            signal
          )
          return {
            dataSetId: result.dataSetId,
            pieceId: firstId(result.piecesIds),
          }
        }
        const result = await abortable(
          SP.waitForAddPieces({ statusUrl }),
          signal
        )
        return {
          dataSetId: result.dataSetId,
          pieceId: firstId(result.confirmedPieceIds),
        }
      } catch (error) {
        if (error instanceof Error && REJECTED_ERRORS.has(error.name)) {
          throw new CliError({
            code: ErrorCodes.commitRejected,
            message: 'The provider reported the commit transaction as failed.',
            cause: error,
          })
        }
        throw error
      }
    },

    async schedulePieceRemoval({ serviceURL, dataSetId, pieceId }) {
      const dataSet = await getDataSet(dataSetId)
      if (!dataSet) throw notFound(`Data set ${dataSetId} not found.`)
      signal?.throwIfAborted()
      const result = await abortable(
        SP.schedulePieceDeletions(signer, {
          serviceURL,
          dataSetId,
          clientDataSetId: dataSet.clientDataSetId,
          pieceIds: [pieceId],
        }),
        signal
      )
      return { transactionHash: result.hash }
    },

    async waitForTransaction(transactionHash) {
      const receipt = await abortable(
        waitForTransactionReceipt(client, { hash: transactionHash }),
        signal
      )
      return { status: receipt.status }
    },
  }

  /** Attach the client data set ID when reusing a data set. */
  async function withDataSet(placement: Placement): Promise<Placement> {
    if (placement.dataSetId == null) return placement
    const dataSet = await getDataSet(placement.dataSetId)
    if (!dataSet) return { ...placement, dataSetId: undefined }
    return { ...placement, clientDataSetId: dataSet.clientDataSetId }
  }

  /** Inputs `getUploadCosts` needs for an existing data set. */
  async function existingDataSetCosts(dataSetId: bigint) {
    const [dataSet, leafCount] = await Promise.all([
      getDataSet(dataSetId),
      PDPVerifier.getDataSetLeafCount(client, { dataSetId }),
    ])
    if (!dataSet) return undefined
    return {
      dataSetLeafCount: leafCount,
      currentLifecycleReserveBalance: dataSet.lifecycleReserveBalance,
      pendingOneTimePayments: dataSet.pendingOneTimePayments,
      pdpEndEpoch: dataSet.pdpEndEpoch,
    }
  }
}

/** First confirmed piece ID from a provider status response. */
function firstId(ids: readonly bigint[]): bigint {
  const [id] = ids
  if (id == null) throw new Error('Provider confirmed no piece IDs.')
  return id
}
