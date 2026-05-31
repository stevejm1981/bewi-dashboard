import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { formatM3, formatKg, formatGBP } from '@/lib/volume/calculate';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

interface ShipmentRow {
  shipment_guid: string;
  shipment_number: string;
  required_date: string | null;
  shipment_status: string;
  customer_name: string | null;
  carrier_name: string | null;
  shipment_method: string | null;
  product_group: string;
  volume_m3: number;
  weight_kg: number;
  line_total: number;
}

export default async function ExpectedToShipPage() {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('v_expected_to_ship').select('*');
  const rows = (data ?? []) as ShipmentRow[];

  // Group by required_date for visual cohesion
  const grouped = rows.reduce<Record<string, ShipmentRow[]>>((acc, r) => {
    const key = r.required_date ?? '—';
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort();

  const totalVolume = rows.reduce((s, r) => s + (r.volume_m3 ?? 0), 0);
  const totalWeight = rows.reduce((s, r) => s + (r.weight_kg ?? 0), 0);
  const totalValue = rows.reduce((s, r) => s + (r.line_total ?? 0), 0);

  return (
    <div className="min-h-screen">
      <DashboardHeader active="/expected-to-ship" />

      <main className="max-w-[1600px] mx-auto px-8 py-10">
        <header className="mb-8 flex items-start justify-between gap-8">
          <div>
            <div className="eyebrow">Section E</div>
            <h1 className="headline text-4xl mt-1">Expected to <em className="not-italic font-medium">Ship</em></h1>
            <p className="mt-3 text-sm text-ink-muted max-w-2xl">
              Open shipments at Howden by required ship date. Volume is calculated from each line's shipped quantity, not the parent order total.
            </p>
          </div>
          <a
            href="/api/export/csv?view=expected_to_ship"
            className="text-xs uppercase tracking-[0.14em] font-medium px-4 py-2.5 border border-ink text-ink hover:bg-ink hover:text-paper transition-colors"
          >
            Export CSV
          </a>
        </header>

        <section className="grid grid-cols-3 gap-px bg-line mb-10 surface">
          <Headline label="Total Volume" value={`${formatM3(totalVolume)} m³`} />
          <Headline label="Total Weight" value={`${formatKg(totalWeight)} kg`} />
          <Headline label="Total Value" value={formatGBP(totalValue)} accent />
        </section>

        {sortedDates.length === 0 ? (
          <div className="surface p-12 text-center text-ink-muted">No open shipments.</div>
        ) : (
          <div className="space-y-8">
            {sortedDates.map((date) => (
              <section key={date} className="surface">
                <header className="px-6 py-4 border-b divider flex items-baseline justify-between">
                  <div>
                    <div className="eyebrow">Required</div>
                    <h3 className="headline text-2xl mt-0.5">
                      {date === '—' ? 'No date set' : format(new Date(date), 'EEEE, do MMMM yyyy')}
                    </h3>
                  </div>
                  <div className="text-xs text-ink-muted tabular">
                    {grouped[date].length} {grouped[date].length === 1 ? 'shipment' : 'shipments'} · {formatM3(grouped[date].reduce((s, r) => s + r.volume_m3, 0))} m³
                  </div>
                </header>
                <table className="w-full text-sm tabular">
                  <thead>
                    <tr className="border-b divider">
                      <th className="px-6 py-3 eyebrow font-medium text-left">Shipment</th>
                      <th className="px-4 py-3 eyebrow font-medium text-left">Customer</th>
                      <th className="px-4 py-3 eyebrow font-medium text-left">Carrier</th>
                      <th className="px-4 py-3 eyebrow font-medium text-left">Group</th>
                      <th className="px-4 py-3 eyebrow font-medium text-left">Status</th>
                      <th className="px-4 py-3 eyebrow font-medium text-right">Volume</th>
                      <th className="px-4 py-3 eyebrow font-medium text-right">Weight</th>
                      <th className="px-4 py-3 eyebrow font-medium text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[date].map((r, idx) => (
                      <tr key={`${r.shipment_guid}-${idx}`} className="border-b divider last:border-b-0 hover:bg-paper-sunk">
                        <td className="px-6 py-2.5 font-medium data-figure">{r.shipment_number}</td>
                        <td className="px-4 py-2.5">{r.customer_name ?? '—'}</td>
                        <td className="px-4 py-2.5 text-ink-muted">{r.carrier_name ?? '—'}</td>
                        <td className="px-4 py-2.5">{r.product_group}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs px-2 py-0.5 border divider text-ink-muted">{r.shipment_status}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right data-figure">{formatM3(r.volume_m3)}</td>
                        <td className="px-4 py-2.5 text-right data-figure text-ink-muted">{formatKg(r.weight_kg)}</td>
                        <td className="px-4 py-2.5 text-right data-figure">{formatGBP(r.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Headline({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-paper-card p-6">
      <div className="eyebrow">{label}</div>
      <div className={`headline text-3xl mt-2 ${accent ? 'text-accent' : ''}`}>{value}</div>
    </div>
  );
}
