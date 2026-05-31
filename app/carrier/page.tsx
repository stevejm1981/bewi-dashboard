import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { formatM3, formatKg } from '@/lib/volume/calculate';

export const dynamic = 'force-dynamic';

interface CarrierRow {
  carrier_name: string;
  shipment_status: string;
  shipment_count: number;
  volume_m3: number;
  weight_kg: number;
}

export default async function CarrierPage() {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('v_carrier_volume').select('*');
  const rows = (data ?? []) as CarrierRow[];

  // Aggregate by carrier for the headline view
  const byCarrier = rows.reduce<Record<string, { carrier_name: string; shipment_count: number; volume_m3: number; weight_kg: number; statuses: Record<string, number> }>>((acc, r) => {
    const key = r.carrier_name;
    if (!acc[key]) {
      acc[key] = {
        carrier_name: key,
        shipment_count: 0,
        volume_m3: 0,
        weight_kg: 0,
        statuses: {},
      };
    }
    acc[key].shipment_count += r.shipment_count;
    acc[key].volume_m3 += r.volume_m3;
    acc[key].weight_kg += r.weight_kg;
    acc[key].statuses[r.shipment_status] = (acc[key].statuses[r.shipment_status] ?? 0) + r.shipment_count;
    return acc;
  }, {});

  const carriers = Object.values(byCarrier).sort((a, b) => b.volume_m3 - a.volume_m3);
  const totalVolume = carriers.reduce((s, c) => s + c.volume_m3, 0);
  const totalShipments = carriers.reduce((s, c) => s + c.shipment_count, 0);

  // Highlight Campeys specifically since the customer flagged them
  const campeys = carriers.find(c => c.carrier_name.toLowerCase().includes('campey'));

  return (
    <div className="min-h-screen">
      <DashboardHeader active="/carrier" />

      <main className="max-w-[1600px] mx-auto px-8 py-10">
        <header className="mb-8 flex items-start justify-between gap-8">
          <div>
            <div className="eyebrow">Section F</div>
            <h1 className="headline text-4xl mt-1">Open Shipments by <em className="not-italic font-medium">Carrier</em></h1>
            <p className="mt-3 text-sm text-ink-muted max-w-2xl">
              Shipment volume by carrier, with volume calculated from shipped quantities. Carrier data is also captured for future use in transport planning.
            </p>
          </div>
          <a
            href="/api/export/csv?view=carrier_volume"
            className="text-xs uppercase tracking-[0.14em] font-medium px-4 py-2.5 border border-ink text-ink hover:bg-ink hover:text-paper transition-colors"
          >
            Export CSV
          </a>
        </header>

        {/* Campeys spotlight */}
        {campeys && (
          <section className="surface mb-10 grid grid-cols-4 gap-px bg-line">
            <div className="bg-paper-card p-6 col-span-2">
              <div className="eyebrow">Highlighted Carrier</div>
              <h2 className="headline text-3xl mt-1">{campeys.carrier_name}</h2>
              <p className="text-xs text-ink-subtle mt-2">
                Volume corrected to use shipped quantities, resolving the variance in the legacy export.
              </p>
            </div>
            <div className="bg-paper-card p-6">
              <div className="eyebrow">Open Volume</div>
              <div className="headline text-3xl mt-2">{formatM3(campeys.volume_m3)} m³</div>
              <div className="text-xs text-ink-muted mt-1 tabular">{formatKg(campeys.weight_kg)} kg</div>
            </div>
            <div className="bg-paper-card p-6">
              <div className="eyebrow">Shipments</div>
              <div className="headline text-3xl mt-2 data-figure">{campeys.shipment_count}</div>
              <div className="text-xs text-ink-muted mt-1 tabular">
                {Math.round((campeys.volume_m3 / Math.max(totalVolume, 1)) * 100)}% of total volume
              </div>
            </div>
          </section>
        )}

        <section className="surface">
          <header className="px-6 py-5 border-b divider flex items-baseline justify-between">
            <div>
              <div className="eyebrow">All Carriers</div>
              <h2 className="headline text-2xl mt-1">Volume Distribution</h2>
            </div>
            <div className="text-xs text-ink-muted tabular">
              {carriers.length} carriers · {totalShipments} open shipments · {formatM3(totalVolume)} m³
            </div>
          </header>

          {carriers.length === 0 ? (
            <div className="p-12 text-center text-ink-muted">No open shipments to display.</div>
          ) : (
            <table className="w-full text-sm tabular">
              <thead>
                <tr className="border-b divider">
                  <th className="px-6 py-3 eyebrow font-medium text-left">Carrier</th>
                  <th className="px-4 py-3 eyebrow font-medium text-right">Shipments</th>
                  <th className="px-4 py-3 eyebrow font-medium text-right">Volume (m³)</th>
                  <th className="px-4 py-3 eyebrow font-medium text-right">Weight (kg)</th>
                  <th className="px-4 py-3 eyebrow font-medium text-left">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {carriers.map((c) => {
                  const pct = (c.volume_m3 / Math.max(totalVolume, 1)) * 100;
                  const isCampeys = c.carrier_name.toLowerCase().includes('campey');
                  return (
                    <tr key={c.carrier_name} className="border-b divider last:border-b-0 hover:bg-paper-sunk transition-colors">
                      <td className="px-6 py-3.5 font-medium">
                        {c.carrier_name}
                        {isCampeys && <span className="ml-2 text-xs eyebrow text-accent">Tracked</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right data-figure">{c.shipment_count}</td>
                      <td className="px-4 py-3.5 text-right data-figure">{formatM3(c.volume_m3)}</td>
                      <td className="px-4 py-3.5 text-right data-figure text-ink-muted">{formatKg(c.weight_kg)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3 max-w-xs">
                          <div className="flex-1 h-1 bg-paper-sunk relative">
                            <div
                              className={`absolute inset-y-0 left-0 ${isCampeys ? 'bg-accent' : 'bg-ink-soft'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-ink-subtle data-figure w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <p className="mt-8 text-xs text-ink-subtle max-w-2xl">
          <span className="eyebrow">A note on volume calculation.</span> Each shipment's volume is the sum of its lines, where each line's volume is the shipped quantity multiplied by the product's NetM3 (or dimensional fallback). The legacy report inherited the parent order's total volume, which overstated partial shipments.
        </p>
      </main>
    </div>
  );
}
