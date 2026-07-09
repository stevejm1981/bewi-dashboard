import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { formatM3 } from '@/lib/volume/calculate';

export const dynamic = 'force-dynamic';

interface CapacityRow {
  cutting_line: string;
  daily_capacity_m3: number;
  in_progress_m3: number;
  in_progress_count: number;
}

const LINE_DESCRIPTIONS: Record<string, string> = {
  SC: 'Standard Cutting',
  '5MCL': 'Five-Metre Cutting Line',
  LPC: 'Large Panel Cutting',
  SPC: 'Specialist Panel Cutting',
};

export default async function CapacityPage() {
  const supabase = getSupabaseServerClient();
  const { data: rows } = await supabase.from('v_cutting_line_capacity').select('*');
  const lines = (rows ?? []) as CapacityRow[];

  return (
    <div className="min-h-screen">
      <DashboardHeader active="/capacity" />

      <main className="max-w-[1600px] mx-auto px-8 py-10">
        <header className="mb-8">
          <div className="eyebrow">Section B</div>
          <h1 className="headline text-4xl mt-1">Cutting Line <em className="not-italic font-medium">Capacity</em></h1>
          <p className="mt-3 text-sm text-ink-muted max-w-2xl">
            In-progress works order volume against configured daily capacity for each cutting line.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-px bg-line">
          {lines.length === 0 && (
            <div className="col-span-2 surface p-12 text-center text-ink-muted">
              No cutting line data yet. Works orders will appear here once the feed is received.
            </div>
          )}
          {lines.map((line) => {
            const load = line.daily_capacity_m3
              ? line.in_progress_m3 / line.daily_capacity_m3
              : 0;
            const loadPct = Math.min(load * 100, 100);
            const overCapacity = line.in_progress_m3 > line.daily_capacity_m3 && line.daily_capacity_m3 > 0;

            return (
              <article key={line.cutting_line} className="bg-paper-card p-8 relative">
                <div className="flex items-baseline justify-between mb-6">
                  <div>
                    <div className="eyebrow">{LINE_DESCRIPTIONS[line.cutting_line] ?? 'Cutting Line'}</div>
                    <h2 className="headline text-5xl mt-1">{line.cutting_line}</h2>
                  </div>
                  <div className="text-xs tabular text-ink-muted">
                    {line.in_progress_count} {line.in_progress_count === 1 ? 'order' : 'orders'} queued
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <Metric label="In Progress" value={`${formatM3(line.in_progress_m3)}`} unit="m³" sub={`${line.in_progress_count} orders`} />
                  <Metric label="Daily Capacity" value={`${formatM3(line.daily_capacity_m3, 0)}`} unit="m³/day" />
                </div>

                {/* Load bar: in-progress volume against daily capacity */}
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="eyebrow">Load vs daily capacity</span>
                    <span className={`data-figure ${overCapacity ? 'text-accent-warm' : ''}`}>{loadPct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-paper-sunk relative">
                    <div
                      className={`absolute inset-y-0 left-0 ${overCapacity ? 'bg-accent-warm' : 'bg-ink'}`}
                      style={{ width: `${loadPct}%` }}
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
              </article>
            );
          })}
        </div>

        <p className="mt-8 text-xs text-ink-subtle max-w-2xl">
          <span className="eyebrow">Note.</span> In Progress reflects works orders currently open in the works order app. When an order completes it leaves the feed and its finished stock appears under Qty on Hand.
        </p>
      </main>
    </div>
  );
}

function Metric({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="headline text-2xl">{value}</span>
        {unit && <span className="text-xs text-ink-muted tabular">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-ink-subtle mt-0.5 tabular">{sub}</div>}
    </div>
  );
}
