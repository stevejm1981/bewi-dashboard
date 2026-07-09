import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { CapacityCards, type CapacityLine, type WorksOrderDetail } from '@/components/dashboard/CapacityCards';

export const dynamic = 'force-dynamic';

interface CapacityRow {
  cutting_line: string;
  daily_capacity_m3: number;
  in_progress_m3: number;
  in_progress_count: number;
}

export default async function CapacityPage() {
  const supabase = getSupabaseServerClient();

  // 1. Capacity summary per line
  const { data: capRows } = await supabase.from('v_cutting_line_capacity').select('*');
  const capacities = (capRows ?? []) as CapacityRow[];

  // 2. Individual in-progress works orders (for the drill-down)
  const { data: woRows } = await supabase
    .from('works_orders')
    .select('works_order_id, sku, product_guid, cutting_line, quantity, net_m3, expected_completion_at')
    .eq('missing_from_feed', false)
    .eq('is_terminal', false);

  const works = (woRows ?? []) as Array<{
    works_order_id: string;
    sku: string;
    product_guid: string | null;
    cutting_line: string | null;
    quantity: number;
    net_m3: number | null;
    expected_completion_at: string | null;
  }>;

  // 3. Attach product descriptions without relying on an FK embed
  const guids = Array.from(new Set(works.map((w) => w.product_guid).filter(Boolean))) as string[];
  const descByGuid = new Map<string, string>();
  if (guids.length > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('guid, product_description')
      .in('guid', guids);
    for (const p of products ?? []) {
      descByGuid.set(p.guid, p.product_description);
    }
  }

  // 4. Group works order detail by (uppercased) cutting line
  const detailByLine = new Map<string, WorksOrderDetail[]>();
  for (const w of works) {
    const line = (w.cutting_line ?? '').toUpperCase();
    const m3 = (w.quantity ?? 0) * (w.net_m3 ?? 0);
    const detail: WorksOrderDetail = {
      assembly_number: w.works_order_id,
      sku: w.sku,
      description: w.product_guid ? descByGuid.get(w.product_guid) ?? null : null,
      quantity: w.quantity ?? 0,
      net_m3: w.net_m3 ?? 0,
      m3,
      required_date: w.expected_completion_at,
    };
    if (!detailByLine.has(line)) detailByLine.set(line, []);
    detailByLine.get(line)!.push(detail);
  }
  // sort each line's orders by m3 descending
  for (const list of detailByLine.values()) {
    list.sort((a, b) => b.m3 - a.m3);
  }

  const lines: CapacityLine[] = capacities.map((c) => ({
    cutting_line: c.cutting_line,
    daily_capacity_m3: c.daily_capacity_m3,
    in_progress_m3: c.in_progress_m3,
    in_progress_count: c.in_progress_count,
    orders: detailByLine.get(c.cutting_line.toUpperCase()) ?? [],
  }));

  return (
    <div className="min-h-screen">
      <DashboardHeader active="/capacity" />

      <main className="max-w-[1600px] mx-auto px-8 py-10">
        <header className="mb-8">
          <div className="eyebrow">Section B</div>
          <h1 className="headline text-4xl mt-1">Cutting Line <em className="not-italic font-medium">Capacity</em></h1>
          <p className="mt-3 text-sm text-ink-muted max-w-2xl">
            In-progress works order volume against configured daily capacity for each cutting line. Click a line to see the works orders behind it.
          </p>
        </header>

        <CapacityCards lines={lines} />

        <p className="mt-8 text-xs text-ink-subtle max-w-2xl">
          <span className="eyebrow">Note.</span> In Progress reflects works orders currently open in the works order app. When an order completes it leaves the feed and its finished stock appears under Qty on Hand.
        </p>
      </main>
    </div>
  );
}
