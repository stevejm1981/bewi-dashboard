import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { formatM3 } from '@/lib/volume/calculate';
import { formatDistanceToNow } from 'date-fns';

export const dynamic = 'force-dynamic';

interface CapacityRow {
  cutting_line: string;
  daily_capacity_m3: number;
  completed_today_m3: number;
  completed_today_count: number;
  in_progress_m3: number;
  in_progress_count: number;
  remaining_capacity_m3: number;
  last_completion_at: string | null;
  throughput_state: 'active' | 'static' | null;
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
            Daily throughput against configured capacity for each cutting line. Lines flagged "static" have not completed a works order in the last 30 minutes.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-px bg-line">
          {lines.length === 0 && (
            <div className="col-span-2 surface p-12 text-center text-ink-muted">
              No cutting line data yet. Run an initial sync and seed mock works orders.
            </div>
          )}
          {lines.map((line) => {
            const utilisation = line.daily_capacity_m3
              ? line.completed_today_m3 / line.daily_capacity_m3
              : 0;
            const utilisationPct = Math.min(utilisation * 100, 100);

            return (
              <article key={line.cutting_line} className="bg-paper-card p-8 relative">
                <div className="flex items-baseline justify-between mb-6">
                  <div>
                    <div className="eyebrow">{LINE_DESCRIPTIONS[line.cutting_line] ?? 'Cutting Line'}</div>
                    <h2 className="headline text-5xl mt-1">{line.cutting_line}</h2>
                  </div>
                  <ThroughputBadge state={line.throughput_state} lastAt={line.last_completion_at} />
                </div>

                <div className="grid grid-cols-3 gap-6 mb-6">
                  <Metric label="Today" value={`${formatM3(line.completed_today_m3)}`} unit="m³" sub={`${line.completed_today_count} orders`} />
                  <Metric label="In Progress" value={`${formatM3(line.in_progress_m3)}`} unit="m³" sub={`${line.in_progress_count} orders`} />
                  <Metric label="Capacity" value={`${formatM3(line.daily_capacity_m3, 0)}`} unit="m³/day" />
                </div>

                {/* Capacity bar */}
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="eyebrow">Utilisation</span>
                    <span className="data-figure">{utilisationPct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-paper-sunk relative">
                    <div
                      className={`absolute inset-y-0 left-0 ${utilisation > 0.9 ? 'bg-accent-warm' : 'bg-ink'}`}
                      style={{ width: `${utilisationPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-ink-subtle tabular pt-1">
                    <span>{formatM3(line.completed_today_m3)} done</span>
                    <span>{formatM3(line.remaining_capacity_m3)} remaining</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
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

function ThroughputBadge({ state, lastAt }: { state: 'active' | 'static' | null; lastAt: string | null }) {
  if (!state) {
    return (
      <div className="text-xs text-ink-subtle tabular">
        Idle &middot; no activity today
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${state === 'active' ? 'bg-accent-ok animate-pulse' : 'bg-accent-warm'}`} />
      <span className={`tabular ${state === 'static' ? 'text-accent-warm' : 'text-ink-muted'}`}>
        {state === 'static' ? 'Static' : 'Active'} {lastAt && `· last ${formatDistanceToNow(new Date(lastAt))} ago`}
      </span>
    </div>
  );
}
