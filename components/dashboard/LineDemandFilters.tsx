'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

/**
 * Week navigation and order-status filter for the Line Demand tab.
 * State lives in the URL: ?start=YYYY-MM-DD&status=A,B
 */
export function LineDemandFilters({
  statuses,
  windowLabel,
  prevStart,
  nextStart,
  isDefaultWindow,
}: {
  statuses: string[];
  windowLabel: string;
  prevStart: string;
  nextStart: string;
  isDefaultWindow: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const activeStatuses = (params.get('status') ?? '').split(',').filter(Boolean);
  const isFiltered = activeStatuses.length > 0 || !isDefaultWindow;

  function push(next: { start?: string | null; statuses?: string[] }) {
    const q = new URLSearchParams();
    const start = next.start === undefined ? params.get('start') : next.start;
    const s = next.statuses ?? activeStatuses;
    if (start) q.set('start', start);
    if (s.length) q.set('status', s.join(','));
    const qs = q.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
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
    <div className="surface px-6 py-4 mb-6 flex flex-wrap items-end gap-6">
      <div>
        <div className="eyebrow mb-2">Window</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => push({ start: prevStart })} style={btn(false)} aria-label="Previous 7 working days">‹</button>
          <span className="text-sm tabular" style={{ minWidth: 200, textAlign: 'center' }}>{windowLabel}</span>
          <button type="button" onClick={() => push({ start: nextStart })} style={btn(false)} aria-label="Next 7 working days">›</button>
          {!isDefaultWindow && (
            <button type="button" onClick={() => push({ start: null })} style={btn(false)}>Today</button>
          )}
        </div>
      </div>

      {statuses.length > 0 && (
        <div>
          <div className="eyebrow mb-2">Order status</div>
          <div className="flex flex-wrap gap-2">
            {statuses.map((s) => {
              const on = activeStatuses.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => push({ statuses: on ? activeStatuses.filter((x) => x !== s) : [...activeStatuses, s] })}
                  style={btn(on)}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isFiltered && (
        <button type="button" onClick={() => router.push(pathname)} className="ml-auto text-xs underline" style={{ color: '#525252' }}>
          Clear filters
        </button>
      )}
    </div>
  );
}
