import {
  AddPiecesPermission,
  CreateDataSetPermission,
  type Permission,
  SchedulePieceRemovalsPermission,
  TerminateServicePermission,
} from '@filoz/synapse-core/session-key'

/**
 * Session-key scopes by the IDs the pay.filecoin.cloud console accepts in its
 * `scopes` link parameter, mapped to FWSS permission typehashes.
 *
 * @see https://github.com/FilOzone/synapse-sdk/blob/master/docs/src/content/docs/developer-guides/session-keys.mdx
 */
export const SCOPES = {
  createDataSet: CreateDataSetPermission,
  addPieces: AddPiecesPermission,
  schedulePieceRemovals: SchedulePieceRemovalsPermission,
  terminateService: TerminateServicePermission,
} as const satisfies Record<string, Permission>

/** A console scope ID. */
export type ScopeId = keyof typeof SCOPES

/** Scopes requested by `foc login` unless `--scopes` is given. */
export const DEFAULT_SCOPES: ScopeId[] = [
  'createDataSet',
  'addPieces',
  'schedulePieceRemovals',
]

/** Scopes a `put` needs: it may create a data set or add to one. */
export const PUT_SCOPES: ScopeId[] = ['createDataSet', 'addPieces']

/** Scopes an `rm` needs. */
export const RM_SCOPES: ScopeId[] = ['schedulePieceRemovals']

/** Whether `value` is a known scope ID. */
export function isScopeId(value: string): value is ScopeId {
  return Object.hasOwn(SCOPES, value)
}

/** Map scope IDs to their permission hashes. */
export function toPermissions(scopes: readonly ScopeId[]): Permission[] {
  return scopes.map((scope) => SCOPES[scope])
}
