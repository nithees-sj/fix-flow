'use client';

import { format, parseISO } from 'date-fns';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS_TEXT, axisProps, compact, GRID, SURFACE, TooltipBody } from './chart-kit';

export interface SeriesDef<K extends string> {
  key: K;
  label: string;
  color: string;
  format?: (v: number) => string;
}

const bucketLabel = (iso: string, granularity: 'day' | 'week' | 'month' = 'day') =>
  format(parseISO(iso), granularity === 'month' ? 'MMM yyyy' : 'd MMM');

interface TimeSeriesProps<K extends string> {
  data: (Record<K, number | null> & { bucket: string })[];
  series: SeriesDef<K>[];
  granularity?: 'day' | 'week' | 'month';
  variant?: 'area' | 'line';
  yFormat?: (v: number) => string;
}

/** Change over time: 2px lines (+10% wash for areas), crosshair tooltip listing every series. */
export function TimeSeriesChart<K extends string>({ data, series, granularity = 'day', variant = 'area', yFormat = compact }: TimeSeriesProps<K>) {
  const Chart = variant === 'area' ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="bucket" {...axisProps} tickFormatter={(v: string) => bucketLabel(v, granularity)} minTickGap={24} />
        <YAxis {...axisProps} allowDecimals={false} tickFormatter={yFormat} width={44} />
        <Tooltip
          cursor={{ stroke: AXIS_TEXT, strokeWidth: 1, strokeOpacity: 0.4 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBody
                title={granularity === 'week' ? `Week of ${bucketLabel(String(label))}` : bucketLabel(String(label), granularity)}
                rows={series.map((s) => {
                  const raw = payload.find((p) => p.dataKey === s.key)?.value;
                  const v = typeof raw === 'number' ? raw : null;
                  return { label: s.label, color: s.color, value: v === null ? '—' : (s.format ?? ((n: number) => n.toLocaleString()))(v) };
                })}
              />
            ) : null
          }
        />
        {series.map((s) =>
          variant === 'area' ? (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              fill={s.color}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ) : (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              connectNulls
              activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

interface BarsProps<K extends string> {
  data: (Record<K, number> & { label: string })[];
  series: SeriesDef<K>[];
  stacked?: boolean;
  layout?: 'horizontal' | 'vertical';
  categoryWidth?: number;
}

/** Magnitude by category: bars ≤ 24px, 4px rounded data-end, 2px surface gap between stack segments. */
export function BarsChart<K extends string>({ data, series, stacked, layout = 'vertical', categoryWidth = 120 }: BarsProps<K>) {
  const horizontalBars = layout === 'vertical';
  const last = series.length - 1;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout={layout} margin={{ top: 4, right: 16, bottom: 0, left: horizontalBars ? 0 : -8 }} barCategoryGap="28%">
        <CartesianGrid horizontal={!horizontalBars} vertical={horizontalBars} stroke={GRID} />
        {horizontalBars ? (
          <>
            <XAxis type="number" {...axisProps} allowDecimals={false} tickFormatter={compact} />
            <YAxis type="category" dataKey="label" {...axisProps} width={categoryWidth} tick={{ fill: '#334155', fontSize: 12 }} />
          </>
        ) : (
          <>
            <XAxis type="category" dataKey="label" {...axisProps} interval={0} />
            <YAxis type="number" {...axisProps} allowDecimals={false} tickFormatter={compact} width={40} />
          </>
        )}
        <Tooltip
          cursor={{ fill: '#F1F5F9', opacity: 0.6 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipBody
                title={String(label)}
                rows={series.map((s) => {
                  const v = Number(payload.find((p) => p.dataKey === s.key)?.value ?? 0);
                  return { label: s.label, color: s.color, value: (s.format ?? ((n: number) => n.toLocaleString()))(v) };
                })}
              />
            ) : null
          }
        />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId={stacked ? 'stack' : undefined}
            fill={s.color}
            maxBarSize={24}
            stroke={SURFACE}
            strokeWidth={stacked ? 2 : 0}
            radius={!stacked || i === last ? (horizontalBars ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
