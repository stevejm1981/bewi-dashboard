'use client';

import { useState } from 'react';
import { formatM3 } from '@/lib/volume/calculate';

export interface WorksOrderDetail {
  assembly_number: string;
  sku: string;
  description: string | null;
  quantity: number;
  net_m3: number;
  m3: number;
  required_date: string | null;
}

export interface CapacityLine {
  cutting_line: string;
  daily_capacity_m3: number;
  in_progress_m3: number;
  in_progress_count: number;
  orders: WorksOrderDetail[];
}

const LINE_DESCRIPTIONS: Record<string, string> = {
  SC: 'Standard Cutting',
  '5MCL': 'Five-Metre Cutting Line',
  LPC: 'Large Panel Cutting',
  SPC: 'Specialist Panel Cutting',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function CapacityCards({ lines }: { lines: CapacityLine[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (lines.length === 0) {
    return (
      <div className="surface p-12 text-center text-ink-muted">
        No cutting line data yet. Works orders will appear here once the feed is received.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-px bg-line">
      {lines.map((line) => {
        const isOpen = expanded === line.cutting_line;
        const load = line.daily_capacity_m3 ? line.in_progress_m3 / line.daily_capacity_m3 : 0;
        const loadPct = Math.min(load * 100, 100);
        const overCapacity = line.in_progress_m3 > line.daily_capacity_m3 && line.daily_capacity_m3 > 0;
        const canExpand = line.orders.length > 0;

        return (
          <article key={line.cutting_line} className="bg-white p-8">
            <div className="flex items-baseline justify-between mb-6">
              <div>
                <div className="eyebrow">{LINE_DESCRIPTIONS[line.cutting_line] ?? 'Cutting Line'}</div>
                <h2 className="headline text-5xl mt-1">{line.cutting_line}</h2>
              </div>
              <button
                type="button"
                onClick={() => canExpand && setExpanded(isOpen ? null : line.cutting_line)}
                disabled={!canExpand}
                className={`text-xs tabular flex items-center gap-1.5 px-2 py-1 -mr-2 rounded transition-colors ${
                  canExpand ? 'text-ink-soft hover:text-ink hover:bg-paper-sunk cursor-pointer' : 'text-ink-subtle cursor-default'
                }`}
                aria-expanded={isOpen}
              >
                {line.in_progress_count} {line.in_progress_count === 1 ? 'order' : 'orders'} queued
                {canExpand && (
                  <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden>▾</span>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <div className="eyebrow">In Progress</div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="headline text-2xl">{formatM3(line.in_progress_m3)}</span>
                  <span className="text-xs text-ink-muted tabular">m³</span>
                </div>
                <div className="text-xs text-ink-subtle mt-0.5 tabular">{line.in_progress_count} orders</div>
              </div>
              <div>
                <div className="eyebrow">Daily Capacity</div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="headline text-2xl">{formatM3(line.daily_capacity_m3, 0)}</span>
                  <span className="text-xs text-ink-muted tabular">m³/day</span>
                </div>
              </div>
            </div>

            {/* Load bar */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-xs">
                <span className="eyebrow">Load vs daily capacity</span>
                <span className={`data-figure ${overCapacity ? 'text-red-700' : ''}`}>{loadPct.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-paper-sunk relative">
                <div
                  className={`absolute inset-y-0 left-0 ${overCapacity ? 'bg-red-700' : 'bg-ink'}`}
                  style={{ width: `${loadPct}%`, backgroundColor: overCapacity ? '#b91c1c' : '#1c1917' }}
                />
              </div>
              <div className="flex justify-between text-xs text-ink-subtle tabular pt-1">
                <span>{formatM3(line.in_progress_m3)} queued</span>
                <span>
                  {overCapacity
                    ? `${formatM3(line.in_progress_m3 - line.daily_capacity_m3)} over`
                    : `${formatM3(line.daily_capacity_m3 - line.in_progress_m3)} headroom`}
                </span>
              </div>
            </div>

            {/* Drill-down: the works orders behind the count */}
            {isOpen && canExpand && (
              <div className="mt-6 pt-5 border-t divider">
                <div className="eyebrow mb-3">Works orders on this line</div>
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-xs tabular">
                    <thead>
                      <tr className="text-left text-ink-muted">
                        <th className="px-2 py-1.5 font-medium">Assembly</th>
                        <th className="px-2 py-1.5 font-medium">Product</th>
                        <th className="px-2 py-1.5 font-medium text-right">Qty</th>
                        <th className="px-2 py-1.5 font-medium text-right">m³</th>
                        <th className="px-2 py-1.5 font-medium text-right">Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {line.orders.map((o) => (
                        <tr key={o.assembly_number} className="border-t divider">
                          <td className="px-2 py-1.5 font-medium">{o.assembly_number}</td>
                          <td className="px-2 py-1.5 text-ink-soft">
                            <span className="block">{o.sku}</span>
                            {o.description && <span className="block text-ink-subtle truncate max-w-[220px]">{o.description}</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right data-figure">{o.quantity}</td>
                          <td className="px-2 py-1.5 text-right data-figure">{formatM3(o.m3)}</td>
                          <td className="px-2 py-1.5 text-right text-ink-soft">{formatDate(o.required_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t divider">
                        <td className="px-2 py-2 eyebrow" colSpan={3}>Total</td>
                        <td className="px-2 py-2 text-right data-figure font-medium">{formatM3(line.in_progress_m3)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
