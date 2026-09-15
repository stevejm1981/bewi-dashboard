import { Suspense } from 'react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { LineDemandGrid, type DayCol, type LineRow, type ShipmentRow } from '@/components/dashboard/LineDemandGrid';
import { LineDemandFilters } from '@/components/dashboard/LineDemandFilters';
import { formatM3 } from '@/lib/volume/calculate';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 7; // working days shown

// ---- date helpers (YYYY-MM-DD strings, UK calendar) ------------------------

function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isWorkingDay(iso: string): boolean {
  const wd = new Date(iso + 'T00:00:00Z').getUTCDay();
  return wd >= 1 && wd <= 5;
}
function nextWorkingDay(iso: string): string {
  let d = iso;
  while (!isWorkingDay(d)) d = addDays(d, 1);
  return d;
}
function workingDaysFrom(start: string, n: number): string[] {
  const out: string[] = [];
  let d = nextWorkingDay(start);
  while (out.length < n) {
    if (isWorkingDay(d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}
function shiftWorkingDays(start: string, n: number): string {
  // move n working days forward (n>0) or back (n<0)
  let d = start;
  let left = Math.abs(n);
  const step = n > 0 ? 1 : -1;
  while (left > 0) {
    d = addDays(d, step);
    if (isWorkingDay(d)) left -= 1;
  }
  return d;
}
function fmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
}

// ---------------------------------------------------------------------------

interface DemandRow {
  cutting_line: string;
  required_date: string;
  shipment_number: string;
  order_number: string | null;
  customer_name: string | null;
  order_status: string | null;
  volume_m3: number;
}

export default async function LineDemandPage({
  searchParams,
}: {
  searchParams: { start?: string; status?: string };
}) {
  const supabase = getSupabaseServerClient();

  const today = londonToday();
  const requestedStart = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.start ?? '') ? (searchParams.start as string) : today;
  const dayKeys = workingDaysFrom(requestedStart, WINDOW_DAYS);
  const windowStart = dayKeys[0];
  const windowEnd = dayKeys[dayKeys.length - 1];
  const isDefaultWindow = windowStart === nextWorkingDay(today);

  const statuses = (searchParams.status ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const [{ data: demandRows }, { data: statusRows }, { data: capRows }] = await Promise.all([
    supabase.rpc('f_shipment_demand_by_line', {
      p_start: windowStart,
      p_end: windowEnd,
      p_statuses: statuses.length ? statuses : null,
    }),
    supabase.rpc('f_shipment_order_statuses'),
    supabase.from('cutting_line_capacity').select('cutting_line, daily_capacity_m3'),
  ]);

  const demand = (demandRows ?? []) as DemandRow[];
  const statusOptions = ((statusRows ?? []) as Array<{ order_status: string }>).map((r) => r.order_status).filter(Boolean);
  const capacityByLine = new Map<string, number>();
  for (const c of (capRows ?? []) as Array<{ cutting_line: string; daily_capacity_m3: number }>) {
    capacityByLine.set(c.cutting_line.toUpperCase(), Number(c.daily_capacity_m3) || 0);
  }

  // Build the pivot: line -> shipment -> day
  const lineMap = new Map<string, Map<string, ShipmentRow>>();
  for (const r of demand) {
    const line = r.cutting_line;
    if (!lineMap.has(line)) lineMap.set(line, new Map());
    const ships = lineMap.get(line)!;
    if (!ships.has(r.shipment_number)) {
      ships.set(r.shipment_number, {
        shipment_number: r.shipment_number,
        order_number: r.order_number,
        customer_name: r.customer_name,
        order_status: r.order_status,
        cells: {},
        total: 0,
      });
    }
    const s = ships.get(r.shipment_number)!;
    const v = Number(r.volume_m3) || 0;
    s.cells[r.required_date] = (s.cells[r.required_date] ?? 0) + v;
    s.total += v;
  }

  // The Category attribute is a general product tag, not only cutting lines
  // (it also holds packaging, raw material grades, tools...). The capacity
  // table defines which values ARE cutting lines. Anything else rolls into
  // OTHER; products with no Category at all are UNASSIGNED.
  const OTHER = 'OTHER CATEGORIES';
  const bucketed = new Map<string, Map<string, ShipmentRow>>();
  for (const [name, ships] of lineMap) {
    const bucket = name === 'UNASSIGNED' ? 'UNASSIGNED' : capacityByLine.has(name) ? name : OTHER;
    if (!bucketed.has(bucket)) bucketed.set(bucket, new Map());
    const target = bucketed.get(bucket)!;
    for (const [key, s] of ships) {
      const k = bucket === name ? key : `${name}:${key}`;
      target.set(k, bucket === name ? s : { ...s, order_number: `${s.order_number ?? s.shipment_number} (${name})` });
    }
  }

  const rank = (n: string) => (n === 'UNASSIGNED' ? 2 : n === OTHER ? 1 : 0);
  const lineNames = new Set<string>([...bucketed.keys(), ...capacityByLine.keys()]);
  const lines: LineRow[] = Array.from(lineNames)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((name) => {
      const ships = Array.from(bucketed.get(name)?.values() ?? []).sort((a, b) => b.total - a.total);
      const cells: Record<string, number> = {};
      let total = 0;
      for (const s of ships) {
        for (const [k, v] of Object.entries(s.cells)) {
          cells[k] = (cells[k] ?? 0) + v;
          total += v;
        }
      }
      const daily = capacityByLine.get(name) ?? 0;
      return {
        cutting_line: name,
        daily_capacity_m3: daily,
        window_capacity_m3: daily * WINDOW_DAYS,
        cells,
        total,
        shipments: ships,
      };
    })
    // hide lines that have neither demand nor a capacity (nothing to say)
    .filter((l) => l.total > 0 || l.daily_capacity_m3 > 0);

  const days: DayCol[] = dayKeys.map((k) => ({
    key: k,
    label: fmt(k, { day: '2-digit', month: '2-digit' }),
    sub: fmt(k, { weekday: 'short' }),
  }));

  const grandTotal = lines.reduce((s, l) => s + l.total, 0);
  const windowLabel = `${fmt(windowStart, { day: 'numeric', month: 'short' })} to ${fmt(windowEnd, { day: 'numeric', month: 'short' })}`;

  return (
    <div className="min-h-screen">
      <DashboardHeader active="/line-demand" />

      <main className="max-w-[1600px] mx-auto px-8 py-10">
        <header className="mb-8">
          <div className="eyebrow">Section E · Sales Orders</div>
          <h1 className="headline text-4xl mt-1">Demand by <em className="not-italic font-medium">Cutting Line</em></h1>
          <p className="mt-3 text-sm text-ink-muted max-w-2xl">
            Open shipment volume by required ship date over the next {WINDOW_DAYS} working days, allocated to each cutting line by the product&apos;s Unleashed line attribute. Expand a line to see the shipments behind it. Click a line&apos;s capacity to change it.
          </p>
        </header>

        <section className="grid grid-cols-3 gap-px bg-line mb-8 surface">
          <Headline label="Demand in window" value={`${formatM3(grandTotal)} m³`} sub={`${WINDOW_DAYS} working days`} />
          <Headline label="Window" value={windowLabel} />
          <Headline label="Lines" value={String(lines.length)} sub={statuses.length ? `status: ${statuses.join(', ')}` : 'all open statuses'} />
        </section>

        <Suspense fallback={null}>
          <LineDemandFilters
            statuses={statusOptions}
            windowLabel={windowLabel}
            prevStart={shiftWorkingDays(windowStart, -WINDOW_DAYS)}
            nextStart={shiftWorkingDays(windowStart, WINDOW_DAYS)}
            isDefaultWindow={isDefaultWindow}
          />
        </Suspense>

        <LineDemandGrid days={days} lines={lines} workingDays={WINDOW_DAYS} />

        <p className="mt-8 text-xs text-ink-subtle max-w-2xl">
          <span className="eyebrow">Note.</span> Demand here comes from open shipments (shipped quantity x NetM3), not from works orders, and each product is assigned to a cutting line by its Unleashed line attribute. A line&apos;s fill bar compares its demand across the window with its daily capacity multiplied by {WINDOW_DAYS} working days. A day figure shown in red exceeds that line&apos;s daily capacity. The Category attribute in Unleashed also holds non-line values (packaging, raw material grades and so on); demand on those appears under OTHER CATEGORIES, and products with no Category at all under UNASSIGNED. A Category value counts as a cutting line when it has a capacity set.
        </p>
      </main>
    </div>
  );
}

function Headline({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-paper-card p-6">
      <div className="eyebrow">{label}</div>
      <div className="headline text-3xl mt-2">{value}</div>
      {sub && <div className="text-xs text-ink-muted mt-1 tabular">{sub}</div>}
    </div>
  );
}
