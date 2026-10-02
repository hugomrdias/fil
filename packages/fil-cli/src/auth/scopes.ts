import {
  AddPiecesPermission,
  CreateDataSetPermission,
  type Permission,
  SchedulePieceRemovalsPermission,
  TerminateServicePermission,
} from '@filoz/synapse-core/session-key'
import type { ScopeId } from './scope-ids.ts'

export { DEFAULT_SCOPES, type ScopeId } from './scope-ids.ts'

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
} as const satisfies Record<ScopeId, Permission>

/** Scopes a `put` needs: it may create a data set or add to one. */
export const PUT_SCOPES: ScopeId[] = ['createDataSet', 'addPieces']

/** Scopes a `delete` needs. */
export const RM_SCOPES: ScopeId[] = ['schedulePieceRemovals']

/** Whether `value` is a known scope ID. */
export function isScopeId(value: string): value is ScopeId {
  return Object.hasOwn(SCOPES, value)
}

/** Map scope IDs to their permission hashes. */
export function toPermissions(scopes: readonly ScopeId[]): Permission[] {
  return scopes.map((scope) => SCOPES[scope])
}
