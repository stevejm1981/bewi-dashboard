'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

/**
 * Date range (sales order date) and status filters for the Volume Matrix.
 * Filter state lives in the URL so the server page re-queries on change and
 * a filtered view is shareable. Clearing returns to the full consolidated view.
 */
export function MatrixFilters({ statuses }: { statuses: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const currentFrom = params.get('from') ?? '';
  const currentTo = params.get('to') ?? '';
  const currentStatuses = (params.get('status') ?? '').split(',').filter(Boolean);

  const [from, setFrom] = useState(currentFrom);
  const [to, setTo] = useState(currentTo);

  const isFiltered = !!(currentFrom || currentTo || currentStatuses.length);

  function push(next: { from?: string; to?: string; statuses?: string[] }) {
    const q = new URLSearchParams();
    const f = next.from ?? currentFrom;
    const t = next.to ?? currentTo;
    const s = next.statuses ?? currentStatuses;
    if (f) q.set('from', f);
    if (t) q.set('to', t);
    if (s.length) q.set('status', s.join(','));
    const qs = q.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function applyDates() {
    push({ from, to });
  }

  function toggleStatus(status: string) {
    const next = currentStatuses.includes(status)
      ? currentStatuses.filter((s) => s !== status)
      : [...currentStatuses, status];
    push({ statuses: next });
  }

  function clearAll() {
    setFrom('');
    setTo('');
    router.push(pathname);
  }

  const inputCls = 'border px-2 py-1 text-sm tabular rounded';
  const inputStyle = { borderColor: '#e7e5e4', backgroundColor: '#ffffff' };

  return (
    <div className="px-6 py-4 border-b divider flex flex-wrap items-end gap-6">
      {/* Date range on sales order date */}
      <div className="flex items-end gap-2">
        <div>
          <div className="eyebrow mb-1">Order date from</div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} style={inputStyle} />
        </div>
        <div>
          <div className="eyebrow mb-1">To</div>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} style={inputStyle} />
        </div>
        <button
          type="button"
          onClick={applyDates}
          className="px-3 py-1.5 text-sm rounded"
          style={{ backgroundColor: '#1c1917', color: '#ffffff' }}
        >
          Apply
        </button>
      </div>

      {/* Status toggles, built from statuses present in the data */}
      {statuses.length > 0 && (
        <div>
          <div className="eyebrow mb-1">Order status</div>
          <div className="flex flex-wrap gap-2">
            {statuses.map((s) => {
              const on = currentStatuses.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  aria-pressed={on}
                  className="px-3 py-1 text-xs rounded border tabular"
                  style={{
                    borderColor: on ? '#1c1917' : '#e7e5e4',
                    backgroundColor: on ? '#1c1917' : '#ffffff',
                    color: on ? '#ffffff' : '#525252',
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isFiltered && (
        <button
          type="button"
          onClick={clearAll}
          className="ml-auto text-xs underline"
          style={{ color: '#525252' }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
