import type { ReactNode } from 'react';

export type ColumnAlign = 'left' | 'right' | 'center';

export interface Column<T> {
  /** property name on the row, or any id when `render` is supplied */
  key: string;
  header: ReactNode;
  align?: ColumnAlign;
  width?: number | string;
  render?: (row: T) => ReactNode;
}

/** one labelled block of rows, rendered under a full-width header row */
export interface RowGroup<T> {
  key: string;
  label: ReactNode;
  rows: T[];
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  /** flat rows; ignored for rendering when `groups` is supplied */
  rows: T[];
  /** when set, rows render grouped under labelled header rows instead of flat */
  groups?: RowGroup<T>[];
  rowKey: (row: T) => string | number;
  density?: 'compact' | 'comfortable';
  onRowClick?: (row: T) => void;
  emptyText?: ReactNode;
  /** caps the scroll container so the sticky header has something to stick to */
  maxHeight?: number | string;
  className?: string;
}

const ALIGN: Record<ColumnAlign, string> = {
  left: 'text-left',
  right: 'text-right tabular-nums',
  center: 'text-center',
};

const CELL_PAD = {
  compact: 'px-3 py-1.5',
  comfortable: 'px-3 py-2.5',
} as const;

/**
 * Reads `row[col.key]` when a column has no `render`. The double assertion is the
 * one place the kit steps outside T's declared shape; it is confined here and only
 * ever produces a primitive or null, never an `any` that leaks to callers.
 */
function fallbackCell<T>(row: T, key: string): ReactNode {
  const value = (row as unknown as Record<string, unknown>)[key];
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return String(value);
  return null;
}

export default function DataTable<T>({
  columns,
  rows,
  groups,
  rowKey,
  density = 'compact',
  onRowClick,
  emptyText = 'ไม่มีข้อมูล',
  maxHeight,
  className,
}: DataTableProps<T>) {
  const pad = CELL_PAD[density];
  const isEmpty = groups ? groups.every((g) => g.rows.length === 0) : rows.length === 0;

  const renderRow = (row: T) => (
    <tr
      key={rowKey(row)}
      onClick={onRowClick === undefined ? undefined : () => onRowClick(row)}
      className={`border-b border-surface-border last:border-b-0 hover:bg-surface-page
                  transition-colors${onRowClick === undefined ? '' : ' cursor-pointer'}`}
    >
      {columns.map((col) => (
        <td
          key={col.key}
          className={`${pad} text-sm text-ink-primary align-middle ${ALIGN[col.align ?? 'left']}`}
        >
          {col.render ? col.render(row) : fallbackCell(row, col.key)}
        </td>
      ))}
    </tr>
  );

  return (
    <div
      style={maxHeight === undefined ? undefined : { maxHeight }}
      className={`bg-surface-card border border-surface-border rounded-xl overflow-auto${
        className ? ` ${className}` : ''
      }`}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width === undefined ? undefined : { width: col.width }}
                className={`${pad} sticky top-0 z-10 bg-surface-page shadow-[inset_0_-1px_0_#E5E7EB]
                            text-xs font-medium uppercase tracking-wide text-ink-secondary
                            whitespace-nowrap ${ALIGN[col.align ?? 'left']}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isEmpty ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-ink-muted">
                {emptyText}
              </td>
            </tr>
          ) : groups ? (
            groups.flatMap((g) => [
              <tr key={`group-${g.key}`} className="bg-surface-page border-y border-surface-border">
                <td colSpan={columns.length} className="px-3 py-1.5 text-xs font-semibold text-ink-primary">
                  {g.label}
                </td>
              </tr>,
              ...g.rows.map(renderRow),
            ])
          ) : (
            rows.map(renderRow)
          )}
        </tbody>
      </table>
    </div>
  );
}
