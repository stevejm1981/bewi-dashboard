'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

/**
 * Top-level period filter for the Cutting Line Capacity tab.
 * Filters the tiles by works order DUE date (not sales order date, which is
 * what the Volume Matrix filter uses). State lives in the URL.
 *
 *   ?period=today | tomorrow | week | nextweek
 *   ?date=YYYY-MM-DD   (a specific day)
 *   (nothing)          all in-progress work, no date filter
 */
const QUICK: Array<{ key: string; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'This week' },
  { key: 'nextweek', label: 'Next week' },
];

export function CapacityPeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const activePeriod = params.get('period') ?? '';
  const activeDate = params.get('date') ?? '';
  const [date, setDate] = useState(activeDate);
  const isFiltered = !!(activePeriod || activeDate);

  function go(query: string) {
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: 12,
    borderRadius: 4,
    border: '1px solid ' + (active ? '#1c1917' : '#e7e5e4'),
    backgroundColor: active ? '#1c1917' : '#ffffff',
    color: active ? '#ffffff' : '#525252',
    cursor: 'pointer',
  });

  return (
    <div className="surface px-6 py-4 mb-8 flex flex-wrap items-end gap-6">
      <div>
        <div className="eyebrow mb-2">Show work due</div>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q.key}
              type="button"
              aria-pressed={activePeriod === q.key}
              onClick={() => { setDate(''); go(`period=${q.key}`); }}
              style={btn(activePeriod === q.key)}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div>
          <div className="eyebrow mb-2">Or a specific day</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm tabular rounded px-2 py-1"
            style={{ border: '1px solid #e7e5e4', backgroundColor: '#ffffff' }}
          />
        </div>
        <button
          type="button"
          onClick={() => date && go(`date=${date}`)}
          disabled={!date}
          style={{ ...btn(false), opacity: date ? 1 : 0.5, cursor: date ? 'pointer' : 'default' }}
        >
          Apply
        </button>
      </div>

      {isFiltered && (
        <button
          type="button"
          onClick={() => { setDate(''); go(''); }}
          className="ml-auto text-xs underline"
          style={{ color: '#525252' }}
        >
          Clear filter · show all
        </button>
      )}
    </div>
  );
}
