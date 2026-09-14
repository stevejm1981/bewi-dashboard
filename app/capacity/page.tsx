import { Suspense } from 'react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { CapacityCards, type CapacityLine, type WorksOrderDetail } from '@/components/dashboard/CapacityCards';
import { CapacityPeriodFilter } from '@/components/dashboard/CapacityPeriodFilter';

export const dynamic = 'force-dynamic';

interface CapacityRow {
  cutting_line: string;
  daily_capacity_m3: number;
  in_progress_m3: number;
  in_progress_count: number;
}

// ---- date helpers (all on YYYY-MM-DD strings, UK calendar) -----------------

function londonToday(): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

function workingDaysBetween(start: string, end: string): number {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    if (wd >= 1 && wd <= 5) n += 1;
  }
  return Math.max(n, 1);
}

function fmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
}

interface Period { start: string; end: string; label: string; workingDays: number }

function resolvePeriod(period?: string, date?: string): Period | null {
  const today = londonToday();
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { start: date, end: date, label: fmt(date, { weekday: 'long', day: 'numeric', month: 'long' }), workingDays: 1 };
  }
  switch (period) {
    case 'today':
      return { start: today, end: today, label: `Today, ${fmt(today, { weekday: 'short', day: 'numeric', month: 'short' })}`, workingDays: 1 };
    case 'tomorrow': {
      const t = addDays(today, 1);
      return { start: t, end: t, label: `Tomorrow, ${fmt(t, { weekday: 'short', day: 'numeric', month: 'short' })}`, workingDays: 1 };
    }
    case 'week': {
      const s = mondayOf(today), e = addDays(s, 6);
      return { start: s, end: e, label: `This week, ${fmt(s, { day: 'numeric', month: 'short' })} to ${fmt(e, { day: 'numeric', month: 'short' })}`, workingDays: workingDaysBetween(s, e) };
    }
    case 'nextweek': {
      const s = addDays(mondayOf(today), 7), e = addDays(s, 6);
      return { start: s, end: e, label: `Next week, ${fmt(s, { day: 'numeric', month: 'short' })} to ${fmt(e, { day: 'numeric', month: 'short' })}`, workingDays: workingDaysBetween(s, e) };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------

export default async function CapacityPage({
  searchParams,
}: {
  searchParams: { period?: string; date?: string };
}) {
  const supabase = getSupabaseServerClient();
  const period = resolvePeriod(searchParams.period, searchParams.date);

  // 1. Lines and their daily capacity
  const { data: capRows } = await supabase.from('v_cutting_line_capacity').select('*');
  const capacities = (capRows ?? []) as CapacityRow[];

  // 2. In-progress works orders, filtered to the period by DUE date if set
  let query = supabase
    .from('works_orders')
    .select('works_order_id, sku, product_guid, cutting_line, quantity, net_m3, expected_completion_at')
    .eq('missing_from_feed', false)
    .eq('is_terminal', false);

  if (period) {
    query = query
      .gte('expected_completion_at', period.start + 'T00:00:00Z')
      .lt('expected_completion_at', addDays(period.end, 1) + 'T00:00:00Z');
  }
  const { data: woRows } = await query;

  const works = (woRows ?? []) as Array<{
    works_order_id: string;
    sku: string;
    product_guid: string | null;
    cutting_line: string | null;
    quantity: number;
    net_m3: number | null;
    expected_completion_at: string | null;
  }>;

  // Undated orders can never match a period; count them so we can say so
  let undatedCount = 0;
  if (period) {
    const { count } = await supabase
      .from('works_orders')
      .select('works_order_id', { count: 'exact', head: true })
      .eq('missing_from_feed', false)
      .eq('is_terminal', false)
      .is('expected_completion_at', null);
    undatedCount = count ?? 0;
  }

  // 3. Product descriptions (no FK embed)
  const guids = Array.from(new Set(works.map((w) => w.product_guid).filter(Boolean))) as string[];
  const descByGuid = new Map<string, string>();
  if (guids.length > 0) {
    const { data: products } = await supabase.from('products').select('guid, product_description').in('guid', guids);
    for (const p of products ?? []) descByGuid.set(p.guid, p.product_description);
  }

  // 4. Group by line and total from the (possibly filtered) orders
  const detailByLine = new Map<string, WorksOrderDetail[]>();
  for (const w of works) {
    const line = (w.cutting_line ?? '').toUpperCase();
    const m3 = (w.quantity ?? 0) * (w.net_m3 ?? 0);
    if (!detailByLine.has(line)) detailByLine.set(line, []);
    detailByLine.get(line)!.push({
      assembly_number: w.works_order_id,
      sku: w.sku,
      description: w.product_guid ? descByGuid.get(w.product_guid) ?? null : null,
      quantity: w.quantity ?? 0,
      net_m3: w.net_m3 ?? 0,
      m3,
      required_date: w.expected_completion_at,
    });
  }
  for (const list of detailByLine.values()) list.sort((a, b) => b.m3 - a.m3);

  const workingDays = period?.workingDays ?? 1;

  const lines: CapacityLine[] = capacities.map((c) => {
    const orders = detailByLine.get(c.cutting_line.toUpperCase()) ?? [];
    return {
      cutting_line: c.cutting_line,
      daily_capacity_m3: c.daily_capacity_m3,
      capacity_m3: c.daily_capacity_m3 * workingDays,
      in_progress_m3: orders.reduce((s, o) => s + o.m3, 0),
      in_progress_count: orders.length,
      orders,
    };
  });

  const capacityLabel = workingDays === 1 ? 'Daily Capacity' : `Capacity, ${workingDays} working days`;
  const inProgressLabel = period ? 'Due in period' : 'In Progress';

  return (
    <div className="min-h-screen">
      <DashboardHeader active="/capacity" />

      <main className="max-w-[1600px] mx-auto px-8 py-10">
        <header className="mb-8">
          <div className="eyebrow">Section B</div>
          <h1 className="headline text-4xl mt-1">Cutting Line <em className="not-italic font-medium">Capacity</em></h1>
          <p className="mt-3 text-sm text-ink-muted max-w-2xl">
            Works order volume against capacity for each cutting line. Pick a day or period to see what is due then; clear to see everything in progress. Click a line to see the works orders behind it.
          </p>
          {period && (
            <p className="mt-2 text-sm tabular" style={{ color: '#1c1917' }}>
              Showing work due: <strong>{period.label}</strong>
              {undatedCount > 0 && (
                <span style={{ color: '#525252' }}> · {undatedCount} undated {undatedCount === 1 ? 'order' : 'orders'} not shown (clear the filter to include)</span>
              )}
            </p>
          )}
        </header>

        <Suspense fallback={null}>
          <CapacityPeriodFilter />
        </Suspense>

        <CapacityCards lines={lines} capacityLabel={capacityLabel} inProgressLabel={inProgressLabel} />

        <p className="mt-8 text-xs text-ink-subtle max-w-2xl">
          <span className="eyebrow">Note.</span> The period filter uses each works order&apos;s due date, so it is independent of the Volume Matrix date filter (which uses sales order date). With a single day selected, the load bar compares that day&apos;s work against one day&apos;s capacity. With a week selected, capacity is scaled to the working days in that week. When a works order completes it leaves the feed and its finished stock appears under Qty on Hand.
        </p>
      </main>
    </div>
  );
}
