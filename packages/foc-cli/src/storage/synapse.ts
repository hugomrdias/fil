import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import * as PDPVerifier from '@filoz/synapse-core/pdp-verifier'
import * as Piece from '@filoz/synapse-core/piece'
import * as SP from '@filoz/synapse-core/sp'
import * as SPRegistry from '@filoz/synapse-core/sp-registry'
import * as WarmStorage from '@filoz/synapse-core/warm-storage'
import { waitForTransactionReceipt } from 'viem/actions'
import type { App } from '../app.ts'
import { buildFundingUrl } from '../auth/login.ts'
import type { SessionKey } from '../auth/session.ts'
import { ExitCode, FocError } from '../errors.ts'
import type { Placement, StorageBackend } from './types.ts'

/**
 * Create the synapse-core storage backend: one copy on one Curio provider,
 * signed by the session key and paid for by its root wallet.
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
      if (providerId != null) {
        const provider = await SPRegistry.getPDPProvider(client, { providerId })
        if (!provider) {
          throw new FocError(
            'PROVIDER_NOT_FOUND',
            `Provider ${providerId} has no active PDP offering.`,
            { exitCode: ExitCode.notFound }
          )
        }
        const input = await WarmStorage.fetchProviderSelectionInput(client, {
          address: payer,
        })
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
      const input = await WarmStorage.fetchProviderSelectionInput(client, {
        address: payer,
      })
      const excluded: bigint[] = []
      for (;;) {
        const [location] = WarmStorage.selectProviders({
          ...input,
          count: 1,
          metadata,
          excludeProviderIds: excluded,
        })
        if (!location) {
          throw new FocError(
            'NO_PROVIDER',
            'No reachable storage provider is available.',
            { exitCode: ExitCode.transient, retryable: true }
          )
        }
        const { provider } = location
        if (await isReachable(provider.pdp.serviceURL)) {
          return withDataSet({
            providerId: provider.id,
            serviceURL: provider.pdp.serviceURL,
            payee: provider.payee,
            dataSetId: location.dataSetId ?? undefined,
          })
        }
        excluded.push(provider.id)
      }
    },

    async assertFunded({ size, placement }) {
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
      if (!costs.ready) {
        const url = buildFundingUrl({
          consoleUrl: app.consoleUrl,
          network: app.network,
          deposit: costs.depositNeeded,
        })
        throw new FocError(
          'FUNDING_REQUIRED',
          costs.needsFwssMaxApproval
            ? 'The payer must deposit USDFC and approve Warm Storage before uploading.'
            : 'The payer must deposit more USDFC before uploading.',
          {
            exitCode: ExitCode.actionRequired,
            info: { fundingUrl: url },
            next: [
              { command: 'status', description: 'Check account readiness' },
            ],
          }
        )
      }
    },

    async hasPiece({ serviceURL, pieceCid }) {
      try {
        await SP.findPiece({ serviceURL, pieceCid: Piece.from(pieceCid) })
        return true
      } catch {
        return false
      }
    },

    async upload({ serviceURL, path, size, pieceCid, onProgress }) {
      const cid = Piece.from(pieceCid)
      await SP.uploadPieceStreaming({
        serviceURL,
        data: Readable.toWeb(createReadStream(path)) as ReadableStream,
        size,
        pieceCid: cid,
        onProgress,
      })
      await SP.findPiece({ serviceURL, pieceCid: cid, poll: true })
    },

    async addPiece({ placement, pieceCid, pieceMetadata }) {
      if (placement.dataSetId == null || placement.clientDataSetId == null) {
        throw new Error('addPiece requires an existing data set.')
      }
      const result = await SP.addPieces(signer, {
        serviceURL: placement.serviceURL,
        dataSetId: placement.dataSetId,
        clientDataSetId: placement.clientDataSetId,
        pieces: [{ pieceCid: Piece.from(pieceCid), metadata: pieceMetadata }],
      })
      return { transactionHash: result.txHash, statusUrl: result.statusUrl }
    },

    async createDataSetWithPiece({
      placement,
      pieceCid,
      metadata,
      pieceMetadata,
    }) {
      const result = await SP.createDataSetAndAddPieces(signer, {
        serviceURL: placement.serviceURL,
        // FWSS verifies the signature against the registry payee.
        payee: placement.payee,
        // Without this the session key address would be the payer.
        payer,
        metadata,
        pieces: [{ pieceCid: Piece.from(pieceCid), metadata: pieceMetadata }],
      })
      return { transactionHash: result.txHash, statusUrl: result.statusUrl }
    },

    async waitForCommit({ statusUrl, created }) {
      if (created) {
        const result = await SP.waitForCreateDataSetAddPieces({ statusUrl })
        return {
          dataSetId: result.dataSetId,
          pieceId: firstId(result.piecesIds),
        }
      }
      const result = await SP.waitForAddPieces({ statusUrl })
      return {
        dataSetId: result.dataSetId,
        pieceId: firstId(result.confirmedPieceIds),
      }
    },

    async schedulePieceRemoval({ serviceURL, dataSetId, pieceId }) {
      const dataSet = await WarmStorage.getPdpDataSet(client, { dataSetId })
      if (!dataSet) {
        throw new FocError(
          'DATA_SET_NOT_FOUND',
          `Data set ${dataSetId} not found.`,
          {
            exitCode: ExitCode.notFound,
          }
        )
      }
      const result = await SP.schedulePieceDeletions(signer, {
        serviceURL,
        dataSetId,
        clientDataSetId: dataSet.clientDataSetId,
        pieceIds: [pieceId],
      })
      return { transactionHash: result.hash }
    },

    async waitForTransaction(transactionHash) {
      await waitForTransactionReceipt(client, { hash: transactionHash })
    },
  }

  /** Attach the client data set ID when reusing a data set. */
  async function withDataSet(placement: Placement): Promise<Placement> {
    if (placement.dataSetId == null) return placement
    const dataSet = await WarmStorage.getPdpDataSet(client, {
      dataSetId: placement.dataSetId,
    })
    if (!dataSet) return { ...placement, dataSetId: undefined }
    return { ...placement, clientDataSetId: dataSet.clientDataSetId }
  }

  /** Inputs `getUploadCosts` needs for an existing data set. */
  async function existingDataSetCosts(dataSetId: bigint) {
    const [dataSet, leafCount] = await Promise.all([
      WarmStorage.getPdpDataSet(client, { dataSetId }),
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
