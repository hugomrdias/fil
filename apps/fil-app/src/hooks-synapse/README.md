# hooks-synapse

React hooks for Filecoin that [`@filoz/synapse-react`](https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-react) (0.5.0) lacks. They wrap [`@filoz/synapse-core`](https://github.com/FilOzone/synapse-sdk/tree/master/packages/synapse-core) only and follow synapse-react's conventions, so they can move upstream with few changes:

- Read hooks take `{ query? }`. Write hooks take `{ mutation?, onHash? }`, with `mutation` spread before `mutationFn`.
- Query keys start with `synapse-` (see `keys.ts`), and writes invalidate the synapse-react caches they affect.
- Reads use `config.getClient({ chainId })`. Unlike synapse-react, every read hook also accepts an optional `chainId`, so explorer pages can read a network other than the wallet's.
- Writes use the wallet's connector client. Hooks for SP (EIP-712) operations also accept `sessionKey` and sign with it when given (`utils.ts`).

| Hook | Wraps | Notes |
| --- | --- | --- |
| `useSessionKey` | `sessionKey.fromSecp256k1`, `watch`, `syncExpirations` | Builds a session key client on the chain's fallback transport and keeps its expirations live |
| `useSessionKeyLogin` | `sessionKey.loginSync` | |
| `useSessionKeyRevoke` | `sessionKey.revokeSync` | |
| `useSessionKeyExpirations` | `sessionKey.getExpirations` | |
| `useAccountSummary` | `pay.getAccountSummary` | Funds, lockups, debt and runway |
| `useDepositWithPermit` | `pay.depositWithPermitSync` | One transaction, no prior approve |
| `useSetOperatorApproval` | `pay.setOperatorApprovalSync` | Custom rate, lockup and period allowances |
| `useRail` | `pay.getRail` | |
| `useSettleRail` | `pay.settleRailSync` | |
| `useSettleTerminatedRail` | `pay.settleTerminatedRailWithoutValidationSync` | |
| `usePdpDataSets` | `warmStorage.getPdpDataSets` with `paginate` | Doesn't fetch every piece; honours `query` |
| `usePdpDataSet` | `warmStorage.getPdpDataSet` | |
| `useStorageSize` | `warmStorage.getAccountTotalStorageSize` | |
| `useUploadCosts` | `warmStorage.getUploadCosts` | |
| `useCreateDataSet` | `sp.createDataSet`, `sp.waitForCreateDataSet` | Adds metadata and session key support |
| `useTerminateDataSet` | `sp.terminateService`, `sp.waitForTerminateService` | |
| `useDeletePieces` | `sp.schedulePieceDeletions` | Batch delete |
| `useUpload` | `sp.uploadPieceStreaming`, `sp.findPiece`, `sp.addPieces`, `sp.waitForAddPieces` | Core-only (synapse-react's `useUpload` uses synapse-sdk). Streams 4 files at a time, tracks progress per file and adds every parked piece in one signed request. Waits for the add-pieces transaction to confirm and returns each piece's confirmed id; failed files come back in `failed` |

## synapse-core issues found while building this

- `sp.waitForAddPieces` keeps polling while `piecesAdded` is `false`, which is also true of a `rejected` status, so a rejected add-pieces transaction surfaces as the 5 minute timeout rather than `WaitForAddPiecesRejectedError`.

## synapse-react issues found while building this

- `useDepositAndApprove` passes only `{ amount }` to core, so its `token`, `operator` and allowance props are ignored.
- `useDataSets` ignores `props.query`, and it loads every piece of every data set.
- `useDeposit`, `useWithdraw` and `useDepositAndApprove` spread `mutation` after `mutationFn`; the other hooks spread it before.
- `useCreateDataSet` has no metadata support (it's commented out) and cannot sign with a session key.
- The package has no `sideEffects` field and its root entry re-exports `useUpload`, so bundles can pull in `@filoz/synapse-sdk` even when `useUpload` is unused.
- No hook takes a `chainId`, so reading a network other than the connected one needs custom hooks.
