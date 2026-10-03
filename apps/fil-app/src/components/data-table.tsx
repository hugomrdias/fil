import {
  type ColumnDef,
  createColumnHelper,
  type RowData,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { type ReactNode, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/** Table features used by every fil-app table (server-sorted, no extras). */
const features = tableFeatures({})

/** Feature set type for column definitions. */
type Features = typeof features

/** Column definition for {@link DataTable}. */
// biome-ignore lint/suspicious/noExplicitAny: column value types vary per column
export type Column<T extends RowData> = ColumnDef<Features, T, any>

/**
 * Column helper bound to the fil-app table features.
 *
 * @see https://tanstack.com/table/latest/docs/guide/column-defs
 */
export function columnHelper<T extends RowData>() {
  return createColumnHelper<Features, T>()
}

/** The parts of a fil-api `useInfiniteQuery` result that a table reads. */
export interface InfiniteTableQuery<T> {
  /** Loaded pages. */
  data?: { pages: { data: T[] }[] }
  /** Whether the first page is loading. */
  isPending: boolean
  /** Whether another page exists. */
  hasNextPage: boolean
  /** Whether the next page is loading. */
  isFetchingNextPage: boolean
  /** Load the next page. */
  fetchNextPage: () => unknown
}

/** Props for {@link DataTable}. */
export interface DataTableProps<T extends RowData> {
  /** Column definitions. */
  columns: Column<T>[]
  /**
   * Paginated query to render; supplies rows, loading and "Load more"
   * unless the props below override them.
   */
  query?: InfiniteTableQuery<T>
  /** Rows to render; defaults to the query's flattened pages. */
  data?: T[]
  /** Show skeleton rows. */
  loading?: boolean
  /** Content when there are no rows. */
  empty?: ReactNode
  /** Whether another page exists. */
  hasNextPage?: boolean
  /** Whether the next page is loading. */
  fetchingNextPage?: boolean
  /** Load the next page. */
  onLoadMore?: () => void
  /** Stable row id. */
  getRowId?: (row: T, index: number) => string
}

/**
 * Headless TanStack Table rendered with shadcn table primitives, with a
 * "Load more" footer for cursor-paginated fil-api lists.
 *
 * @see https://tanstack.com/table/latest/docs/framework/react/react-table
 */
export function DataTable<T extends RowData>(props: DataTableProps<T>) {
  const { query } = props
  const pages = query?.data
  const flat = useMemo(
    () => pages?.pages.flatMap((page) => page.data) ?? [],
    [pages]
  )
  const data = props.data ?? flat
  const loading = props.loading ?? query?.isPending
  const hasNextPage = props.hasNextPage ?? query?.hasNextPage
  const fetchingNextPage = props.fetchingNextPage ?? query?.isFetchingNextPage
  const onLoadMore =
    props.onLoadMore ?? (query ? () => query.fetchNextPage() : undefined)
  const table = useTable({
    features,
    columns: props.columns,
    data,
    getRowId: props.getRowId,
  })
  const columnCount = props.columns.length

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead className="whitespace-nowrap" key={header.id}>
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 5 }, (_, row) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                  <TableRow key={row}>
                    {Array.from({ length: columnCount }, (_, cell) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton cells
                      <TableCell key={cell}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getAllCells().map((cell) => (
                      <TableCell className="whitespace-nowrap" key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
            {!loading && data.length === 0 ? (
              <TableRow>
                <TableCell
                  className="h-24 text-center text-muted-foreground"
                  colSpan={columnCount}
                >
                  {props.empty ?? 'No results.'}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {hasNextPage && onLoadMore ? (
        <div className="flex justify-center">
          <Button
            disabled={fetchingNextPage}
            onClick={onLoadMore}
            variant="outline"
          >
            {fetchingNextPage ? <Spinner /> : null}
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  )
}
