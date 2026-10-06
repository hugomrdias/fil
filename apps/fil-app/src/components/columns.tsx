import { Link } from '@tanstack/react-router'
import { Address } from '@/components/address'
import { type Column, columnHelper } from '@/components/data-table'
import { LocalTime, useLocalTime } from '@/components/local-time'
import { RetrievalLink } from '@/components/retrieval-link'
import {
  FlagBadge,
  RailStateBadge,
  StatusBadge,
} from '@/components/status-badge'
import { TokenAmount } from '@/components/token-amount'
import { TxLink } from '@/components/tx-link'
import type {
  DataSet,
  Piece,
  PieceWithDataSet,
  Provider,
  Rail,
  SessionKey,
  SessionKeyEvent,
  Settlement,
} from '@/lib/api/client'
import { formatBytes, ratePerDay, shortId, urlHost } from '@/lib/format'
import type { Network } from '@/lib/networks'
import { permissionLabel } from '@/lib/permissions'

const LINK = 'font-mono text-primary underline-offset-4 hover:underline'

/** Link to a data set detail page. */
export function DataSetLink(props: { network: Network; id: string }) {
  return (
    <Link
      className={LINK}
      params={{ network: props.network, id: props.id }}
      to="/$network/data-sets/$id"
    >
      #{props.id}
    </Link>
  )
}

/** Link to a provider detail page. */
export function ProviderLink(props: {
  network: Network
  id: string | null
  name?: string | null
}) {
  if (!props.id) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <Link
      className={LINK}
      params={{ network: props.network, id: props.id }}
      to="/$network/providers/$id"
    >
      {props.name ? `${props.name} (#${props.id})` : `#${props.id}`}
    </Link>
  )
}

/** Link to a rail detail page. */
export function RailLink(props: { network: Network; id: string }) {
  return (
    <Link
      className={LINK}
      params={{ network: props.network, id: props.id }}
      to="/$network/rails/$id"
    >
      #{props.id}
    </Link>
  )
}

/** Link to a piece page. */
export function PieceLink(props: { network: Network; cid: string | null }) {
  if (!props.cid) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <Link
      className={LINK}
      params={{ network: props.network, cid: props.cid }}
      title={props.cid}
      to="/$network/pieces/$cid"
    >
      {shortId(props.cid)}
    </Link>
  )
}

/** Data set status from its deleted flag. */
export function DataSetStatus(props: { dataSet: DataSet }) {
  if (props.dataSet.deleted) {
    return <StatusBadge tone="neutral">Deleted</StatusBadge>
  }
  if (props.dataSet.pdpEndEpoch && props.dataSet.pdpEndEpoch !== '0') {
    return <StatusBadge tone="warning">Terminating</StatusBadge>
  }
  return <StatusBadge tone="success">Live</StatusBadge>
}

/**
 * Data set table columns.
 *
 * @param network - Filecoin network.
 */
export function dataSetColumns(network: Network): Column<DataSet>[] {
  const c = columnHelper<DataSet>()
  return c.columns([
    c.accessor('dataSetId', {
      header: 'Data set',
      cell: (info) => <DataSetLink id={info.getValue()} network={network} />,
    }),
    c.accessor('owner', {
      header: 'Owner',
      cell: (info) => <Address network={network} value={info.getValue()} />,
    }),
    c.accessor('providerId', {
      header: 'Provider',
      cell: (info) => <ProviderLink id={info.getValue()} network={network} />,
    }),
    c.accessor('withCdn', {
      header: 'CDN',
      cell: (info) => <FlagBadge value={info.getValue()} />,
    }),
    c.accessor('withIpfsIndexing', {
      header: 'IPFS',
      cell: (info) => <FlagBadge value={info.getValue()} />,
    }),
    c.display({
      id: 'status',
      header: 'Status',
      cell: (info) => <DataSetStatus dataSet={info.row.original} />,
    }),
    c.accessor('createdAtBlock', {
      header: 'Created at block',
      cell: (info) => (
        <span className="tabular-nums">{info.getValue() ?? '—'}</span>
      ),
    }),
  ])
}

/**
 * Provider table columns.
 *
 * @param network - Filecoin network.
 */
export function providerColumns(network: Network): Column<Provider>[] {
  const c = columnHelper<Provider>()
  return c.columns([
    c.accessor('providerId', {
      header: 'Provider',
      cell: (info) => (
        <ProviderLink
          id={info.getValue()}
          name={info.row.original.name}
          network={network}
        />
      ),
    }),
    c.accessor('address', {
      header: 'Address',
      cell: (info) => <Address network={network} value={info.getValue()} />,
    }),
    c.accessor('serviceUrl', {
      header: 'Service URL',
      cell: (info) =>
        info.getValue()?.startsWith('http') ? (
          <a
            className="text-primary hover:underline"
            href={info.getValue() ?? undefined}
            rel="noreferrer"
            target="_blank"
          >
            {urlHost(info.getValue() ?? '')}
          </a>
        ) : (
          (info.getValue() ?? '—')
        ),
    }),
    c.accessor('active', {
      header: 'Active',
      cell: (info) => <FlagBadge value={info.getValue()} />,
    }),
    c.accessor('approved', {
      header: 'Approved',
      cell: (info) => <FlagBadge value={info.getValue()} />,
    }),
    c.accessor('endorsed', {
      header: 'Endorsed',
      cell: (info) => <FlagBadge value={info.getValue()} />,
    }),
    c.accessor('createdAtBlock', {
      header: 'Registered at block',
      cell: (info) => (
        <span className="tabular-nums">{info.getValue() ?? '—'}</span>
      ),
    }),
  ])
}

/**
 * Piece table columns for a single data set.
 *
 * @param network - Filecoin network.
 */
export function pieceColumns(network: Network): Column<Piece>[] {
  const c = columnHelper<Piece>()
  return c.columns([
    c.accessor('pieceId', {
      header: 'Piece',
      cell: (info) => <span className="tabular-nums">#{info.getValue()}</span>,
    }),
    c.accessor('cid', {
      header: 'PieceCID',
      cell: (info) => <PieceLink cid={info.getValue()} network={network} />,
    }),
    c.display({
      id: 'retrieve',
      header: 'Retrieve',
      cell: (info) => (
        <RetrievalLink cid={info.row.original.cid} network={network} />
      ),
    }),
    c.accessor('rawSize', {
      header: 'Size',
      cell: (info) => formatBytes(info.getValue()),
    }),
    c.accessor('removed', {
      header: 'Status',
      cell: (info) => (
        <FlagBadge no="Removed" value={!info.getValue()} yes="Active" />
      ),
    }),
    c.accessor('addedAtBlock', {
      header: 'Added at block',
      cell: (info) => (
        <span className="tabular-nums">{info.getValue() ?? '—'}</span>
      ),
    }),
  ])
}

/**
 * Piece table columns across data sets.
 *
 * @param network - Filecoin network.
 */
export function pieceWithDataSetColumns(
  network: Network
): Column<PieceWithDataSet>[] {
  const c = columnHelper<PieceWithDataSet>()
  return c.columns([
    c.accessor('cid', {
      header: 'PieceCID',
      cell: (info) => <PieceLink cid={info.getValue()} network={network} />,
    }),
    c.display({
      id: 'retrieve',
      header: 'Retrieve',
      cell: (info) => (
        <RetrievalLink cid={info.row.original.cid} network={network} />
      ),
    }),
    c.accessor('dataSetId', {
      header: 'Data set',
      cell: (info) => <DataSetLink id={info.getValue()} network={network} />,
    }),
    c.accessor('pieceId', {
      header: 'Piece',
      cell: (info) => <span className="tabular-nums">#{info.getValue()}</span>,
    }),
    c.accessor('owner', {
      header: 'Owner',
      cell: (info) => <Address network={network} value={info.getValue()} />,
    }),
    c.accessor('providerId', {
      header: 'Provider',
      cell: (info) => <ProviderLink id={info.getValue()} network={network} />,
    }),
    c.accessor('rawSize', {
      header: 'Size',
      cell: (info) => formatBytes(info.getValue()),
    }),
    c.accessor('removed', {
      header: 'Status',
      cell: (info) => (
        <FlagBadge no="Removed" value={!info.getValue()} yes="Active" />
      ),
    }),
  ])
}

/**
 * Rail table columns.
 *
 * @param network - Filecoin network.
 */
export function railColumns(network: Network): Column<Rail>[] {
  const c = columnHelper<Rail>()
  return c.columns([
    c.accessor('railId', {
      header: 'Rail',
      cell: (info) => <RailLink id={info.getValue()} network={network} />,
    }),
    c.accessor('payer', {
      header: 'Payer',
      cell: (info) => <Address network={network} value={info.getValue()} />,
    }),
    c.accessor('payee', {
      header: 'Payee',
      cell: (info) => <Address network={network} value={info.getValue()} />,
    }),
    c.accessor('operator', {
      header: 'Operator',
      cell: (info) => <Address network={network} value={info.getValue()} />,
    }),
    c.accessor('state', {
      header: 'State',
      cell: (info) => <RailStateBadge state={info.getValue()} />,
    }),
    c.accessor('paymentRate', {
      header: 'Rate',
      cell: (info) => (
        <TokenAmount
          network={network}
          suffix="/day"
          token={info.row.original.token}
          value={ratePerDay(info.getValue())}
        />
      ),
    }),
    c.accessor('totalSettledAmount', {
      header: 'Settled',
      cell: (info) => (
        <TokenAmount
          network={network}
          token={info.row.original.token}
          value={info.getValue()}
        />
      ),
    }),
    c.accessor('createdAt', {
      header: 'Created',
      cell: (info) => <LocalTime seconds={info.getValue()} />,
    }),
  ])
}

/**
 * Settlement table columns.
 *
 * @param network - Filecoin network.
 * @param token - Rail token address.
 */
export function settlementColumns(
  network: Network,
  token: string
): Column<Settlement>[] {
  const c = columnHelper<Settlement>()
  return c.columns([
    c.accessor('timestamp', {
      header: 'Date',
      cell: (info) => <LocalTime seconds={info.getValue()} />,
    }),
    c.accessor('totalSettledAmount', {
      header: 'Settled',
      cell: (info) => (
        <TokenAmount network={network} token={token} value={info.getValue()} />
      ),
    }),
    c.accessor('totalNetPayeeAmount', {
      header: 'Net to payee',
      cell: (info) => (
        <TokenAmount network={network} token={token} value={info.getValue()} />
      ),
    }),
    c.accessor('operatorCommission', {
      header: 'Commission',
      cell: (info) => (
        <TokenAmount network={network} token={token} value={info.getValue()} />
      ),
    }),
    c.accessor('networkFee', {
      header: 'Network fee',
      cell: (info) => (
        <TokenAmount network={network} token={token} value={info.getValue()} />
      ),
    }),
    c.accessor('settledUpTo', {
      header: 'Settled up to',
      cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
    }),
    c.accessor('txHash', {
      header: 'Tx',
      cell: (info) => <TxLink hash={info.getValue()} network={network} />,
    }),
  ])
}

/** Comma-separated permission names with expiry state. */
function PermissionList(props: { permissions: SessionKey['permissions'] }) {
  const formatTime = useLocalTime()
  return (
    <span className="flex flex-wrap gap-1">
      {props.permissions.map((permission) => (
        <span
          className={
            permission.active
              ? 'rounded-md border px-1.5 text-xs'
              : 'rounded-md border px-1.5 text-xs text-muted-foreground line-through'
          }
          key={permission.permission}
          title={`Expires ${formatTime(permission.expiry)}`}
        >
          {permission.name ?? permissionLabel(permission.permission)}
        </span>
      ))}
    </span>
  )
}

/**
 * Session key table columns.
 *
 * @param network - Filecoin network.
 */
export function sessionKeyColumns(network: Network): Column<SessionKey>[] {
  const c = columnHelper<SessionKey>()
  return c.columns([
    c.accessor('identity', {
      header: 'Identity',
      cell: (info) => <Address network={network} value={info.getValue()} />,
    }),
    c.accessor('signer', {
      header: 'Signer',
      cell: (info) => <Address network={network} value={info.getValue()} />,
    }),
    c.accessor('active', {
      header: 'Status',
      cell: (info) => (
        <FlagBadge no="Expired" value={info.getValue()} yes="Active" />
      ),
    }),
    c.accessor('expiry', {
      header: 'Expires',
      cell: (info) =>
        info.getValue() === '0' ? '—' : <LocalTime seconds={info.getValue()} />,
    }),
    c.accessor('permissions', {
      header: 'Permissions',
      cell: (info) => <PermissionList permissions={info.getValue()} />,
    }),
    c.display({
      id: 'origin',
      header: 'Origin',
      cell: (info) =>
        [
          ...new Set(
            info.row.original.permissions
              .map((p) => p.origin)
              .filter((origin): origin is string => Boolean(origin))
          ),
        ].join(', ') || '—',
    }),
  ])
}

/**
 * Session key history columns.
 *
 * @param network - Filecoin network.
 */
export function sessionKeyEventColumns(
  network: Network
): Column<SessionKeyEvent>[] {
  const c = columnHelper<SessionKeyEvent>()
  return c.columns([
    c.accessor('timestamp', {
      header: 'Date',
      cell: (info) => <LocalTime seconds={info.getValue()} />,
    }),
    c.accessor('identity', {
      header: 'Identity',
      cell: (info) => <Address network={network} value={info.getValue()} />,
    }),
    c.accessor('signer', {
      header: 'Signer',
      cell: (info) => <Address network={network} value={info.getValue()} />,
    }),
    c.accessor('expiry', {
      header: 'Action',
      cell: (info) =>
        info.getValue() === '0' ? (
          <StatusBadge tone="danger">Revoked</StatusBadge>
        ) : (
          <StatusBadge tone="success">
            Authorized until <LocalTime seconds={info.getValue()} />
          </StatusBadge>
        ),
    }),
    c.accessor('permissions', {
      header: 'Permissions',
      cell: (info) => info.getValue().map(permissionLabel).join(', '),
    }),
    c.accessor('origin', {
      header: 'Origin',
      cell: (info) => info.getValue() ?? '—',
    }),
    c.accessor('txHash', {
      header: 'Tx',
      cell: (info) => <TxLink hash={info.getValue()} network={network} />,
    }),
  ])
}
