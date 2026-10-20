'use client';

import { Table2, BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Chart tokens (validated with the dataviz palette validator against #FFFFFF):
 * categorical slots in fixed order — never cycled, color follows the entity.
 * Slot 3 (aqua) is < 3:1 on white, so every chart ships a legend and a table view.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const;
export const GRID = '#EDF1F6';
export const AXIS_TEXT = '#64748B';
export const SURFACE = '#FFFFFF';

export const axisProps = {
  tick: { fill: AXIS_TEXT, fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;

export function compact(n: number): string {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export interface LegendItem {
  label: string;
  color: string;
  shape?: 'line' | 'rect';
}

export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={i.shape === 'line' ? 'h-0.5 w-3 rounded-full' : 'size-2.5 rounded-[3px]'}
            style={{ background: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Tooltip body: values lead (strong), series names follow, keyed by a short line. */
export function TooltipBody({ title, rows }: { title: string; rows: { label: string; value: string; color: string }[] }) {
  return (
    <div className="min-w-40 rounded-lg border border-line bg-surface px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-ink-3">{title}</p>
      <ul className="grid gap-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />
            <span className="font-semibold text-ink tabular">{r.value}</span>
            <span className="text-ink-3">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ChartFrameProps {
  title: string;
  description?: string;
  legend?: LegendItem[];
  table: { columns: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
  className?: string;
  /** Previous render stays visible while refetching (no layout jump). */
  refreshing?: boolean;
  height?: number;
  action?: React.ReactNode;
}

/** Card chrome for every chart: title, legend, chart ⇄ table toggle (accessibility relief). */
export function ChartFrame({ title, description, legend, table, children, className, refreshing, height = 240, action }: ChartFrameProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className={cn('flex min-w-0 flex-col rounded-xl border border-line bg-surface shadow-xs', className)} aria-label={title}>
      <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          <button
            type="button"
            onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
            className="grid size-7 place-items-center rounded-md text-ink-4 transition-colors hover:bg-surface-muted hover:text-ink-2"
            aria-label={view === 'chart' ? `Show ${title} as a table` : `Show ${title} as a chart`}
            title={view === 'chart' ? 'View as table' : 'View as chart'}
          >
            {view === 'chart' ? <Table2 className="size-4" /> : <BarChart3 className="size-4" />}
          </button>
        </div>
      </div>
      {legend && legend.length > 1 && view === 'chart' && (
        <div className="px-5 pb-2">
          <Legend items={legend} />
        </div>
      )}
      <div className={cn('px-3 pb-4 transition-opacity', refreshing && 'opacity-60')}>
        {view === 'chart' ? (
          <div style={{ height }} className="w-full">
            {children}
          </div>
        ) : (
          <div className="max-h-[320px] overflow-auto px-2 scrollbar-thin" style={{ minHeight: height }}>
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} scope="col" className="sticky top-0 border-b border-line bg-surface py-2 pr-4 text-xs font-medium text-ink-3">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j} className="border-b border-line-subtle py-1.5 pr-4 text-ink-2 tabular">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
