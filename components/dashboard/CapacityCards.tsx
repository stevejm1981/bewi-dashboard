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

type ViewMode = 'list' | 'timeline';

const LINE_DESCRIPTIONS: Record<string, string> = {
  SC: 'Standard Cutting',
  '5MCL': 'Five-Metre Cutting Line',
  LPC: 'Large Panel Cutting',
  SPC: 'Specialist Panel Cutting',
};

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' });
}

/** Group orders by due date (YYYY-MM-DD), dates ascending, undated last. */
function groupByDate(orders: WorksOrderDetail[]): Array<{ key: string; label: string; orders: WorksOrderDetail[]; m3: number }> {
  const map = new Map<string, WorksOrderDetail[]>();
  for (const o of orders) {
    const key = o.required_date ? o.required_date.slice(0, 10) : 'unscheduled';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }
  const keys = Array.from(map.keys()).sort((a, b) => {
    if (a === 'unscheduled') return 1;
    if (b === 'unscheduled') return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return keys.map((key) => {
    const list = map.get(key)!.slice().sort((a, b) => b.m3 - a.m3);
    return {
      key,
      label: key === 'unscheduled' ? 'Unscheduled' : formatLongDate(key),
      orders: list,
      m3: list.reduce((s, o) => s + o.m3, 0),
    };
  });
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  );
}

export function CapacityCards({ lines }: { lines: CapacityLine[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  if (lines.length === 0) {
    return (
      <div className="surface p-12 text-center text-ink-muted">
        No cutting line data yet. Works orders will appear here once the feed is received.
      </div>
    );
  }

  const iconBtn = (active: boolean) => ({
    padding: '4px 6px',
    borderRadius: 4,
    border: '1px solid ' + (active ? '#1c1917' : '#e7e5e4'),
    backgroundColor: active ? '#1c1917' : '#ffffff',
    color: active ? '#ffffff' : '#525252',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
  });

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
                <span className="data-figure" style={{ color: overCapacity ? '#b91c1c' : undefined }}>{loadPct.toFixed(0)}%</span>
              </div>
              <div className="h-2 relative" style={{ backgroundColor: '#f5f5f4' }}>
                <div
                  className="absolute inset-y-0 left-0"
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

            {/* Drill-down */}
            {isOpen && canExpand && (
              <div className="mt-6 pt-5 border-t divider">
                <div className="flex items-center justify-between mb-3">
                  <div className="eyebrow">Works orders on this line</div>
                  <div className="flex items-center gap-1" role="group" aria-label="View mode">
                    <button type="button" title="List" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')} style={iconBtn(viewMode === 'list')}>
                      <ListIcon />
                    </button>
                    <button type="button" title="Timeline by due date" aria-pressed={viewMode === 'timeline'} onClick={() => setViewMode('timeline')} style={iconBtn(viewMode === 'timeline')}>
                      <CalendarIcon />
                    </button>
                  </div>
                </div>

                {viewMode === 'list' ? (
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
                            <td className="px-2 py-1.5 text-right text-ink-soft">{formatShortDate(o.required_date)}</td>
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
                ) : (
                  <div className="-mx-2">
                    {groupByDate(line.orders).map((g) => (
                      <div key={g.key} className="mb-4">
                        <div className="flex items-baseline justify-between px-2 py-1.5 border-b" style={{ borderColor: '#1c1917' }}>
                          <span className="text-xs font-medium">{g.label}</span>
                          <span className="text-xs text-ink-muted tabular">
                            {g.orders.length} {g.orders.length === 1 ? 'order' : 'orders'} · {formatM3(g.m3)} m³
                          </span>
                        </div>
                        <table className="w-full text-xs tabular">
                          <tbody>
                            {g.orders.map((o) => (
                              <tr key={o.assembly_number} className="border-t divider">
                                <td className="px-2 py-1.5 font-medium w-[30%]">{o.assembly_number}</td>
                                <td className="px-2 py-1.5 text-ink-soft">
                                  <span className="block">{o.sku}</span>
                                  {o.description && <span className="block text-ink-subtle truncate max-w-[220px]">{o.description}</span>}
                                </td>
                                <td className="px-2 py-1.5 text-right data-figure w-[12%]">{o.quantity}</td>
                                <td className="px-2 py-1.5 text-right data-figure w-[12%]">{formatM3(o.m3)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                    <div className="flex items-baseline justify-between px-2 py-2 border-t divider">
                      <span className="eyebrow">Total</span>
                      <span className="data-figure font-medium text-xs">{formatM3(line.in_progress_m3)} m³</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
