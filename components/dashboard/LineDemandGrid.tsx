'use client';

import { useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { formatM3 } from '@/lib/volume/calculate';

export interface DayCol { key: string; label: string; sub: string }

export interface ShipmentRow {
  shipment_number: string;
  order_number: string | null;
  customer_name: string | null;
  order_status: string | null;
  cells: Record<string, number>; // day key -> m3
  total: number;
}

export interface LineRow {
  cutting_line: string;
  daily_capacity_m3: number;
  window_capacity_m3: number; // daily x working days in window
  cells: Record<string, number>;
  total: number;
  shipments: ShipmentRow[];
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} aria-hidden>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function CapacityEditor({ line, value }: { line: string; value: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/capacity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutting_line: line, daily_capacity_m3: Number(draft) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Save failed (${res.status})`);
      }
      setEditing(false);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        title="Click to change daily capacity"
        className="text-xs tabular underline decoration-dotted"
        style={{ color: '#525252' }}
      >
        {formatM3(value, 0)} m³/day
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        autoFocus
        className="text-xs tabular rounded px-1 py-0.5"
        style={{ width: 80, border: '1px solid #e7e5e4', backgroundColor: '#ffffff' }}
      />
      <span className="text-xs" style={{ color: '#525252' }}>m³/day</span>
      <button type="button" onClick={save} disabled={saving} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: '#1c1917', color: '#ffffff' }}>
        {saving ? '…' : 'Save'}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs underline" style={{ color: '#525252' }}>Cancel</button>
      {error && <span className="text-xs" style={{ color: '#b91c1c' }}>{error}</span>}
    </span>
  );
}

export function LineDemandGrid({ days, lines, workingDays }: { days: DayCol[]; lines: LineRow[]; workingDays: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(line: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line); else next.add(line);
      return next;
    });
  }

  const colTotals: Record<string, number> = {};
  for (const d of days) colTotals[d.key] = lines.reduce((s, l) => s + (l.cells[d.key] ?? 0), 0);
  const grandTotal = lines.reduce((s, l) => s + l.total, 0);

  const th = 'px-3 py-3 eyebrow font-medium whitespace-nowrap';
  const cell = 'px-3 py-2.5 text-right data-figure';

  if (lines.length === 0) {
    return <div className="surface p-12 text-center text-ink-muted">No open shipment demand in this window.</div>;
  }

  return (
    <div className="surface overflow-auto">
      <table className="w-full text-sm tabular" style={{ minWidth: 900 }}>
        <thead>
          <tr className="border-b divider text-left" style={{ backgroundColor: '#fafaf9' }}>
            <th className={`${th} sticky left-0`} style={{ backgroundColor: '#fafaf9', minWidth: 260 }}>Cutting line</th>
            {days.map((d) => (
              <th key={d.key} className={`${th} text-right`}>
                <div>{d.label}</div>
                <div className="text-[10px] font-normal normal-case tracking-normal" style={{ color: '#a3a3a3' }}>{d.sub}</div>
              </th>
            ))}
            <th className={`${th} text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const isOpen = open.has(l.cutting_line);
            const cap = l.window_capacity_m3;
            const load = cap > 0 ? l.total / cap : 0;
            const pct = Math.min(load * 100, 100);
            const over = cap > 0 && l.total > cap;
            const canExpand = l.shipments.length > 0;

            return (
              <Fragment key={l.cutting_line}>
                {/* Line row */}
                <tr className="border-t divider">
                  <td className="px-3 py-3 sticky left-0" style={{ backgroundColor: '#ffffff', minWidth: 260 }}>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => canExpand && toggle(l.cutting_line)}
                        disabled={!canExpand}
                        aria-expanded={isOpen}
                        className="inline-flex items-center justify-center w-5 h-5 rounded"
                        style={{ border: '1px solid #e7e5e4', color: canExpand ? '#1c1917' : '#d6d3d1', cursor: canExpand ? 'pointer' : 'default' }}
                        title={canExpand ? 'Show shipments' : 'No shipments'}
                      >
                        <Chevron open={isOpen} />
                      </button>
                      <span className="font-medium">{l.cutting_line}</span>
                    </div>
                    {/* Fill bar: demand in window vs capacity for window */}
                    <div className="mt-2 ml-7">
                      <div className="flex items-baseline justify-between text-[11px]" style={{ color: '#525252' }}>
                        <CapacityEditor line={l.cutting_line} value={l.daily_capacity_m3} />
                        <span className="data-figure" style={{ color: over ? '#b91c1c' : undefined }}>
                          {cap > 0 ? `${pct.toFixed(0)}% of ${formatM3(cap, 0)}` : 'no capacity set'}
                        </span>
                      </div>
                      <div className="h-1.5 mt-1 relative" style={{ backgroundColor: '#f5f5f4' }}>
                        <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, backgroundColor: over ? '#b91c1c' : '#1c1917' }} />
                      </div>
                    </div>
                  </td>
                  {days.map((d) => {
                    const v = l.cells[d.key] ?? 0;
                    const dayOver = l.daily_capacity_m3 > 0 && v > l.daily_capacity_m3;
                    return (
                      <td key={d.key} className={cell} style={{ color: v === 0 ? '#d6d3d1' : dayOver ? '#b91c1c' : undefined, fontWeight: dayOver ? 600 : undefined }}
                        title={dayOver ? `Over daily capacity of ${formatM3(l.daily_capacity_m3, 0)}` : undefined}>
                        {v === 0 ? '·' : formatM3(v)}
                      </td>
                    );
                  })}
                  <td className={`${cell} font-medium`}>{formatM3(l.total)}</td>
                </tr>

                {/* Shipment rows */}
                {isOpen && l.shipments.map((s) => (
                  <tr key={`${l.cutting_line}-${s.shipment_number}`} className="border-t divider" style={{ backgroundColor: '#fafaf9' }}>
                    <td className="px-3 py-2 sticky left-0" style={{ backgroundColor: '#fafaf9' }}>
                      <div className="ml-7 text-xs">
                        <span className="font-medium">{s.order_number ?? s.shipment_number}</span>
                        {s.order_number && <span style={{ color: '#a3a3a3' }}> · {s.shipment_number}</span>}
                        <div style={{ color: '#525252' }}>{s.customer_name ?? '—'}{s.order_status ? ` · ${s.order_status}` : ''}</div>
                      </div>
                    </td>
                    {days.map((d) => {
                      const v = s.cells[d.key] ?? 0;
                      return <td key={d.key} className={`${cell} text-xs`} style={{ color: v === 0 ? '#d6d3d1' : '#525252' }}>{v === 0 ? '·' : formatM3(v)}</td>;
                    })}
                    <td className={`${cell} text-xs`} style={{ color: '#525252' }}>{formatM3(s.total)}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t" style={{ backgroundColor: '#1c1917', color: '#ffffff', borderColor: '#1c1917' }}>
            <td className="px-3 py-3 font-medium sticky left-0" style={{ backgroundColor: '#1c1917' }}>Total</td>
            {days.map((d) => <td key={d.key} className={`${cell} font-medium`}>{formatM3(colTotals[d.key])}</td>)}
            <td className={`${cell} font-medium`}>{formatM3(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
