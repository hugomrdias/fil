import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { Network } from '@/lib/networks'
import { api, unwrap } from './client'
import type { paths } from './schema'

/** fil-api cache lifetime, matching its `Cache-Control: max-age=15`. */
const STALE_TIME = 15_000

/** Query parameters of a fil-api list route, minus paging. */
type Filters<P extends keyof paths> = Omit<
  NonNullable<
    paths[P] extends { get: { parameters: { query?: infer Q } } } ? Q : never
  >,
  'cursor' | 'limit'
>

/** Data set list filters. */
export type DataSetFilters = Filters<'/{network}/data-sets'>
/** Provider list filters. */
export type ProviderFilters = Filters<'/{network}/providers'>
/** Cross-data-set piece filters. */
export type PieceFilters = Filters<'/{network}/pieces'>
/** Rail list filters. */
export type RailFilters = Filters<'/{network}/rails'>
/** Session key list filters. */
export type SessionKeyFilters = Filters<'/{network}/session-keys'>
/** Session key history filters. */
export type SessionKeyEventFilters = Filters<'/{network}/session-keys/history'>

/**
 * Query key prefix for every fil-api query of a network.
 *
 * @param network - Filecoin network.
 */
export function networkKey(network: Network) {
  return ['fil-api', network] as const
}

/**
 * Query key prefix for every fil-api query.
 *
 * @param network - Filecoin network.
 * @param resource - Resource name.
 * @param params - Extra key parts.
 */
export function apiKey(
  network: Network,
  resource: string,
  ...params: unknown[]
) {
  return [...networkKey(network), resource, ...params] as const
}

/** Shared infinite-query paging options. */
const paging = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last: { nextCursor: string | null }) =>
    last.nextCursor ?? undefined,
  staleTime: STALE_TIME,
}

/**
 * Indexer status for a network.
 *
 * @param network - Filecoin network.
 */
export function statusQuery(network: Network) {
  return queryOptions({
    queryKey: apiKey(network, 'status'),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/{network}/status', {
          params: { path: { network } },
          signal,
        })
      ).data,
    staleTime: STALE_TIME,
    refetchInterval: 60_000,
  })
}

/**
 * Paginated providers.
 *
 * @param network - Filecoin network.
 * @param filters - Provider filters.
 * @param limit - Page size.
 */
export function providersInfinite(
  network: Network,
  filters: ProviderFilters = {},
  limit = 50
) {
  return infiniteQueryOptions({
    ...paging,
    queryKey: apiKey(network, 'providers', filters, limit),
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await api.GET('/{network}/providers', {
          params: {
            path: { network },
            query: { ...filters, limit, cursor: pageParam },
          },
          signal,
        })
      ),
  })
}

/**
 * A single provider.
 *
 * @param network - Filecoin network.
 * @param providerId - Provider id.
 */
export function providerQuery(network: Network, providerId: string) {
  return queryOptions({
    queryKey: apiKey(network, 'provider', providerId),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/{network}/providers/{providerId}', {
          params: { path: { network, providerId } },
          signal,
        })
      ).data,
    staleTime: STALE_TIME,
  })
}

/**
 * Paginated data sets.
 *
 * @param network - Filecoin network.
 * @param filters - Data set filters.
 * @param limit - Page size.
 */
export function dataSetsInfinite(
  network: Network,
  filters: DataSetFilters = {},
  limit = 50
) {
  return infiniteQueryOptions({
    ...paging,
    queryKey: apiKey(network, 'data-sets', filters, limit),
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await api.GET('/{network}/data-sets', {
          params: {
            path: { network },
            query: { ...filters, limit, cursor: pageParam },
          },
          signal,
        })
      ),
  })
}

/**
 * A single data set.
 *
 * @param network - Filecoin network.
 * @param dataSetId - Data set id.
 */
export function dataSetQuery(network: Network, dataSetId: string) {
  return queryOptions({
    queryKey: apiKey(network, 'data-set', dataSetId),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/{network}/data-sets/{dataSetId}', {
          params: { path: { network, dataSetId } },
          signal,
        })
      ).data,
    staleTime: STALE_TIME,
  })
}

/**
 * Paginated pieces of a data set.
 *
 * @param network - Filecoin network.
 * @param dataSetId - Data set id.
 * @param removed - Filter by removal state.
 * @param limit - Page size.
 */
export function dataSetPiecesInfinite(
  network: Network,
  dataSetId: string,
  removed?: 'true' | 'false',
  limit = 50
) {
  return infiniteQueryOptions({
    ...paging,
    queryKey: apiKey(network, 'data-set-pieces', dataSetId, removed, limit),
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await api.GET('/{network}/data-sets/{dataSetId}/pieces', {
          params: {
            path: { network, dataSetId },
            query: { removed, limit, cursor: pageParam },
          },
          signal,
        })
      ),
  })
}

/**
 * Paginated pieces across data sets. Needs `owner`, `cid` or `provider_id`.
 *
 * @param network - Filecoin network.
 * @param filters - Piece filters.
 * @param limit - Page size.
 */
export function piecesInfinite(
  network: Network,
  filters: PieceFilters,
  limit = 50
) {
  return infiniteQueryOptions({
    ...paging,
    queryKey: apiKey(network, 'pieces', filters, limit),
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await api.GET('/{network}/pieces', {
          params: {
            path: { network },
            query: { ...filters, limit, cursor: pageParam },
          },
          signal,
        })
      ),
  })
}

/**
 * Paginated rails.
 *
 * @param network - Filecoin network.
 * @param filters - Rail filters.
 * @param limit - Page size.
 */
export function railsInfinite(
  network: Network,
  filters: RailFilters = {},
  limit = 50
) {
  return infiniteQueryOptions({
    ...paging,
    queryKey: apiKey(network, 'rails', filters, limit),
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await api.GET('/{network}/rails', {
          params: {
            path: { network },
            query: { ...filters, limit, cursor: pageParam },
          },
          signal,
        })
      ),
  })
}

/**
 * A single rail.
 *
 * @param network - Filecoin network.
 * @param railId - Rail id.
 */
export function railQuery(network: Network, railId: string) {
  return queryOptions({
    queryKey: apiKey(network, 'rail', railId),
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/{network}/rails/{railId}', {
          params: { path: { network, railId } },
          signal,
        })
      ).data,
    staleTime: STALE_TIME,
  })
}

/**
 * Paginated settlements of a rail.
 *
 * @param network - Filecoin network.
 * @param railId - Rail id.
 * @param limit - Page size.
 */
export function settlementsInfinite(
  network: Network,
  railId: string,
  limit = 50
) {
  return infiniteQueryOptions({
    ...paging,
    queryKey: apiKey(network, 'settlements', railId, limit),
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await api.GET('/{network}/rails/{railId}/settlements', {
          params: {
            path: { network, railId },
            query: { limit, cursor: pageParam },
          },
          signal,
        })
      ),
  })
}

/**
 * Paginated session key authorizations.
 *
 * @param network - Filecoin network.
 * @param filters - Session key filters.
 * @param limit - Page size.
 */
export function sessionKeysInfinite(
  network: Network,
  filters: SessionKeyFilters = {},
  limit = 50
) {
  return infiniteQueryOptions({
    ...paging,
    queryKey: apiKey(network, 'session-keys', filters, limit),
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await api.GET('/{network}/session-keys', {
          params: {
            path: { network },
            query: { ...filters, limit, cursor: pageParam },
          },
          signal,
        })
      ),
  })
}

/**
 * Paginated session key authorization events.
 *
 * @param network - Filecoin network.
 * @param filters - History filters.
 * @param limit - Page size.
 */
export function sessionKeyEventsInfinite(
  network: Network,
  filters: SessionKeyEventFilters = {},
  limit = 50
) {
  return infiniteQueryOptions({
    ...paging,
    queryKey: apiKey(network, 'session-key-events', filters, limit),
    queryFn: async ({ pageParam, signal }) =>
      unwrap(
        await api.GET('/{network}/session-keys/history', {
          params: {
            path: { network },
            query: { ...filters, limit, cursor: pageParam },
          },
          signal,
        })
      ),
  })
}
