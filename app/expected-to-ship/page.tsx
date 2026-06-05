import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { formatM3, formatKg, formatGBP } from '@/lib/volume/calculate';

export const dynamic = 'force-dynamic';

interface ShipmentRow {
  shipment_guid: string;
  shipment_number: string;
  shipment_status: string;
  required_date: string | null;
  customer_name: string | null;
  carrier_name: string | null;
  group_name: string | null;
  volume_m3: number;
  weight_kg: number;
  total_value: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default async function ExpectedToShipPage() {
  const supabase = getSupabaseServerClient();
  const { data: rows } = await supabase
    .from('v_expected_to_ship_placed')
    .select('*')
    .order('required_date', { ascending: true });

  const shipments = (rows ?? []) as ShipmentRow[];

  const totals = shipments.reduce(
    (acc, r) => ({
      volume_m3: acc.volume_m3 + (r.volume_m3 ?? 0),
      weight_kg: acc.weight_kg + (r.weight_kg ?? 0),
      total_value: acc.total_value + (r.total_value ?? 0),
    }),
    { volume_m3: 0, weight_kg: 0, total_value: 0 },
  );

  // Group by required date
  const groups = new Map<string, ShipmentRow[]>();
  for (const s of shipments) {
    const key = s.required_date ?? 'unscheduled';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  return (
    <div className="min-h-screen">
      <DashboardHeader active="/expected-to-ship" />

      <main className="max-w-[1600px] mx-auto px-8 py-10">
        <header className="mb-10 max-w-3xl">
          <div className="eyebrow">Section D</div>
          <h1 className="headline text-4xl mt-2 tracking-tightest">
            Expected to <em className="not-italic font-medium">Ship</em>
          </h1>
          <p className="mt-3 text-ink-muted leading-relaxed">
            Open shipments at Howden tied to <strong className="text-ink font-medium">Placed</strong> sales orders, grouped by required ship date. Volume is calculated from each line's shipped quantity, not the parent order total.
          </p>
        </header>

        {/* Headline metrics */}
        <section className="grid grid-cols-3 gap-px bg-line mb-10 surface">
          <Headline label="Total Volume" value={`${formatM3(totals.volume_m3)} m³`} sub={`${shipments.length} shipments`} />
          <Headline label="Total Weight" value={`${formatKg(totals.weight_kg)} kg`} />
          <Headline label="Total Value" value={formatGBP(totals.total_value)} accent />
        </section>

        <div className="mb-6 flex items-baseline justify-between">
          <p className="text-xs text-ink-muted">Placed orders only · grouped by required ship date</p>
          <a
            href="/api/export/csv?view=expected_to_ship_placed"
            className="text-xs uppercase tracking-[0.14em] text-ink-muted hover:text-ink transition-colors"
          >
            Export CSV
          </a>
        </div>

        {shipments.length === 0 && (
          <div className="surface px-6 py-12 text-center text-ink-muted">
            No shipments found at Placed status. Check back after the next sync.
          </div>
        )}

        {[...groups.entries()].map(([dateKey, dateShipments]) => {
          const dateTotal = dateShipments.reduce((sum, s) => sum + (s.volume_m3 ?? 0), 0);
          return (
            <section key={dateKey} className="mb-8 surface">
              <header className="px-6 py-4 border-b divider bg-paper-sunk">
                <div className="eyebrow">Required</div>
                <div className="flex items-baseline justify-between mt-1">
                  <h3 className="headline text-xl">{dateKey === 'unscheduled' ? 'Unscheduled' : formatDate(dateKey)}</h3>
                  <p className="text-xs text-ink-muted tabular">
                    {dateShipments.length} shipment{dateShipments.length === 1 ? '' : 's'} · {formatM3(dateTotal)} m³
                  </p>
                </div>
              </header>

              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular">
                  <thead>
                    <tr className="border-b divider text-left">
                      <th className="px-6 py-3 eyebrow font-medium">Shipment</th>
                      <th className="px-4 py-3 eyebrow font-medium">Customer</th>
                      <th className="px-4 py-3 eyebrow font-medium">Carrier</th>
                      <th className="px-4 py-3 eyebrow font-medium">Group</th>
                      <th className="px-4 py-3 eyebrow font-medium">Status</th>
                      <th className="px-4 py-3 eyebrow font-medium text-right">Volume</th>
                      <th className="px-4 py-3 eyebrow font-medium text-right">Weight</th>
                      <th className="px-4 py-3 eyebrow font-medium text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dateShipments.map((s) => (
                      <tr key={s.shipment_guid} className="border-b divider hover:bg-paper-sunk transition-colors">
                        <td className="px-6 py-3 font-medium tracking-tight text-sm">{s.shipment_number}</td>
                        <td className="px-4 py-3 text-ink-soft text-sm">{s.customer_name ?? '—'}</td>
                        <td className="px-4 py-3 text-ink-soft text-sm">{s.carrier_name ?? '—'}</td>
                        <td className="px-4 py-3 text-ink-soft text-sm">{s.group_name ?? '—'}</td>
                        <td className="px-4 py-3 text-ink-muted text-xs uppercase tracking-wide">{s.shipment_status}</td>
                        <td className="px-4 py-3 text-right data-figure">{formatM3(s.volume_m3)} m³</td>
                        <td className="px-4 py-3 text-right data-figure text-ink-soft">{formatKg(s.weight_kg)} kg</td>
                        <td className="px-4 py-3 text-right data-figure text-ink-soft">{formatGBP(s.total_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}

function Headline({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-paper-card p-6">
      <div className="eyebrow">{label}</div>
      <div className={`headline text-4xl mt-2 ${accent ? 'text-accent' : ''}`}>{value}</div>
      {sub && <div className="text-xs text-ink-muted mt-1 tabular">{sub}</div>}
    </div>
  );
}
