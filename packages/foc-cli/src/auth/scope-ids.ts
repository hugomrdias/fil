/**
 * Session-key scope IDs the pay.filecoin.cloud console accepts in its
 * `scopes` link parameter. Kept free of SDK imports so command definitions
 * can validate them; `scopes.ts` maps them to permission hashes.
 */
export const SCOPE_IDS = [
  'createDataSet',
  'addPieces',
  'schedulePieceRemovals',
  'terminateService',
] as const

/** A console scope ID. */
export type ScopeId = (typeof SCOPE_IDS)[number]

/** Scopes requested by `foc login` unless `--scopes` is given. */
export const DEFAULT_SCOPES: ScopeId[] = [
  'createDataSet',
  'addPieces',
  'schedulePieceRemovals',
]
