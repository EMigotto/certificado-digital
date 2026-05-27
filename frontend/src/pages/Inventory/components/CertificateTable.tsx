import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type SortingState,
} from '@tanstack/react-table';
import { useState, useCallback } from 'react';
import type { CertificateRow } from '@/services/certificateApi';
import { columns } from './TableColumns';
import { EmptyState } from './EmptyState';
import styles from './CertificateTable.module.css';

interface CertificateTableProps {
  data: CertificateRow[];
  isLoading: boolean;
  hasFilters: boolean;
  hasSearch: boolean;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
  onSortChange?: (sort: string, sortDir: 'asc' | 'desc') => void;
  onRowClick?: (id: string) => void;
  currentSort?: string;
  currentSortDir?: 'asc' | 'desc';
}

/** Map TanStack column IDs to API sort field names */
const SORT_FIELD_MAP: Record<string, string> = {
  commonName: 'commonName',
  zone: 'zone',
  status: 'status',
  caProvider: 'caProvider',
  owner: 'owner',
  daysUntilExpiry: 'notAfter',
};

export function CertificateTable({
  data,
  isLoading,
  hasFilters,
  hasSearch,
  onClearSearch,
  onClearFilters,
  onSortChange,
  onRowClick,
  currentSort,
  currentSortDir,
}: CertificateTableProps) {
  const [sorting, setSorting] = useState<SortingState>(() => {
    if (currentSort) {
      const colId =
        Object.entries(SORT_FIELD_MAP).find(([, v]) => v === currentSort)?.[0] ?? currentSort;
      return [{ id: colId, desc: currentSortDir === 'desc' }];
    }
    return [];
  });

  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      setSorting((old) => {
        const next = typeof updater === 'function' ? updater(old) : updater;
        if (next.length > 0 && onSortChange) {
          const field = SORT_FIELD_MAP[next[0].id] ?? next[0].id;
          onSortChange(field, next[0].desc ? 'desc' : 'asc');
        }
        return next;
      });
    },
    [onSortChange],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableSortingRemoval: false,
  });

  // Loading skeleton
  if (isLoading && data.length === 0) {
    return (
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c.id ?? `col-${i}`} className={styles.th}>
                  {'header' in c && typeof c.header === 'string' ? c.header : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((_, j) => (
                  <td key={j} className={styles.td}>
                    <div className={styles.skeleton} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className={styles.tableWrap}>
        <EmptyState
          hasFilters={hasFilters}
          hasSearch={hasSearch}
          onClearSearch={onClearSearch}
          onClearFilters={onClearFilters}
        />
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <div className={styles.scrollWrapper}>
        <table>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={styles.th}
                      style={
                        header.column.getSize()
                          ? { width: header.column.getSize() }
                          : undefined
                      }
                      onClick={
                        canSort ? header.column.getToggleSortingHandler() : undefined
                      }
                    >
                      <span className={canSort ? styles.sortable : ''}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                        {sorted === 'asc' && ' ↑'}
                        {sorted === 'desc' && ' ↓'}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={styles.row}
                onClick={() => onRowClick?.(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={styles.td}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
