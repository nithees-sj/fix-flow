'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Skeleton } from './display';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Server-side sort key (enables the sortable header). */
  sortKey?: string;
  className?: string;
  headerClassName?: string;
  /** Hide below a breakpoint to keep tables readable on small screens. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}

const HIDE: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  sort?: { key: string; order: 'asc' | 'desc' };
  onSortChange?: (key: string, order: 'asc' | 'desc') => void;
  caption: string;
  skeletonRows?: number;
  dense?: boolean;
}

/**
 * Accessible data table: real <table> semantics, sortable headers announced via aria-sort,
 * keyboard-activatable rows (Enter), skeleton loading and a designed empty state.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  onRowClick,
  sort,
  onSortChange,
  caption,
  skeletonRows = 8,
  dense,
}: DataTableProps<T>) {
  const showSkeleton = loading && !rows?.length;
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort && c.sortKey && sort.key === c.sortKey;
              const ariaSort = active ? (sort.order === 'asc' ? 'ascending' : 'descending') : c.sortKey ? 'none' : undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn(
                    'sticky top-0 z-[1] whitespace-nowrap border-b border-line bg-surface-sunken px-4 py-2.5 text-xs font-medium text-ink-3 first:pl-5 last:pr-5',
                    c.hideBelow && HIDE[c.hideBelow],
                    c.headerClassName,
                  )}
                >
                  {c.sortKey && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(c.sortKey!, active && sort.order === 'desc' ? 'asc' : 'desc')}
                      className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-ink"
                    >
                      {c.header}
                      {active ? (sort.order === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />) : <ArrowUpDown className="size-3.5 opacity-40" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {showSkeleton &&
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={`s${i}`}>
                {columns.map((c) => (
                  <td key={c.key} className={cn('border-b border-line-subtle px-4 py-3.5 first:pl-5 last:pr-5', c.hideBelow && HIDE[c.hideBelow])}>
                    <Skeleton className="h-4 w-[70%]" />
                  </td>
                ))}
              </tr>
            ))}
          {!showSkeleton &&
            rows?.map((row) => (
              <tr
                key={rowKey(row)}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
                className={cn('group transition-colors', onRowClick && 'cursor-pointer hover:bg-surface-sunken focus-visible:bg-brand-soft/60 focus-visible:outline-none')}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'border-b border-line-subtle px-4 align-middle text-ink-2 first:pl-5 last:pr-5 group-last:border-b-0',
                      dense ? 'py-2.5' : 'py-3',
                      c.hideBelow && HIDE[c.hideBelow],
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {!loading && rows && rows.length === 0 && empty}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  noun = 'results',
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  noun?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line-subtle px-5 py-3 text-[13px] text-ink-3">
      <p className="tabular">
        <span className="font-medium text-ink-2">{from.toLocaleString()}–{to.toLocaleString()}</span> of {total.toLocaleString()} {noun}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="icon-sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="px-2 tabular" aria-live="polite">
          Page {page} of {pageCount}
        </span>
        <Button variant="secondary" size="icon-sm" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
