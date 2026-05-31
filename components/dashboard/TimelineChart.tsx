'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

interface Props {
  data: Array<Record<string, any>>;
  xKey: string;
  valueKey: string;
  seriesKey: string;
  emptyLabel: string;
}

const PALETTE = ['#1f4e3d', '#c4622d', '#3d6b4a', '#a8341c', '#525252', '#8a6f47', '#4f5d8e', '#7c4a8e'];

export function TimelineChart({ data, xKey, valueKey, seriesKey, emptyLabel }: Props) {
  const { pivoted, series } = useMemo(() => {
    if (data.length === 0) return { pivoted: [] as any[], series: [] as string[] };

    const xs = [...new Set(data.map(d => d[xKey]))].sort();
    const ss = [...new Set(data.map(d => d[seriesKey]))];

    const pivoted = xs.map(x => {
      const row: Record<string, any> = { [xKey]: x };
      for (const s of ss) {
        const match = data.find(d => d[xKey] === x && d[seriesKey] === s);
        row[s] = match?.[valueKey] ?? 0;
      }
      return row;
    });

    return { pivoted, series: ss };
  }, [data, xKey, valueKey, seriesKey]);

  if (pivoted.length === 0) {
    return <div className="h-72 flex items-center justify-center text-sm text-ink-muted">{emptyLabel}</div>;
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={pivoted} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="#e7e5e4" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: '#737373', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#d6d3d1' }} />
          <YAxis tick={{ fill: '#737373', fontSize: 11 }} tickLine={false} axisLine={false} unit=" m³" />
          <Tooltip
            cursor={{ fill: '#f5f5f4' }}
            contentStyle={{
              background: '#ffffff',
              border: '1px solid #e7e5e4',
              borderRadius: 0,
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
            }}
            labelStyle={{ fontFamily: 'var(--font-sans)', fontWeight: 500, color: '#0a0a0a' }}
            formatter={(value: number) => [`${value.toFixed(1)} m³`, undefined]}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-sans)' }} iconType="square" iconSize={10} />
          {series.map((s, idx) => (
            <Bar key={s} dataKey={s} stackId="a" fill={PALETTE[idx % PALETTE.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
