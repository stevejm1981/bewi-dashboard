import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { formatM3, formatKg, formatGBP } from '@/lib/volume/calculate';

export const dynamic = 'force-dynamic';

interface CarrierRow {
  carrier_name: string;
  shipment_count: number;
  volume_m3: number;
  weight_kg: number;
  total_value: number;
}

export default async function CarrierPage() {
  const supabase = getSupabaseServerClient();
  const { data: rows } = await supabase
    .from('v_carrier_volume_placed')
    .select('*')
    .order('volume_m3', { ascending: false });

  const carriers = (rows ?? []) as CarrierRow[];

  const totals = carriers.reduce(
    (acc, r) => ({
      volume_m3: acc.volume_m3 + (r.volume_m3 ?? 0),
      weight_kg: acc.weight_kg + (r.weight_kg ?? 0),
      total_value: acc.total_value + (r.total_value ?? 0),
      shipment_count: acc.shipment_count + (r.shipment_count ?? 0),
    }),
    { volume_m3: 0, weight_kg: 0, total_value: 0, shipment_count: 0 },
  );

  return (
    <div className="min-h-screen">
      <DashboardHeader active="/carrier" />

      <main className="max-w-[1600px] mx-auto px-8 py-10">
        <header className="mb-10 max-w-3xl">
          <div className="eyebrow">Section E</div>
          <h1 className="headline text-4xl mt-2 tracking-tightest">
            Carrier <em className="not-italic font-medium">Demand</em>
          </h1>
          <p className="mt-3 text-ink-muted leading-relaxed">
            Open shipments at Howden tied to <strong className="text-ink font-medium">Placed</strong> sales orders.
            Shows the volume committed to each carrier on orders not yet started picking. Volume is calculated from each line's shipped quantity using NetM3, with dimensional fallback.
          </p>
        </header>

        {/* Headline metrics */}
        <section className="grid grid-cols-4 gap-px bg-line mb-10 surface">
          <Headline label="Total Volume" value={`${formatM3(totals.volume_m3)} m³`} sub={`${totals.shipment_count} shipments`} />
          <Headline label="Total Weight" value={`${formatKg(totals.weight_kg)} kg`} />
          <Headline label="Total Value" value={formatGBP(totals.total_value)} />
          <Headline label="Carriers" value={carriers.length.toString()} sub="active" accent />
        </section>

        {/* Table */}
        <section className="surface">
          <header className="px-6 py-5 border-b divider flex items-baseline justify-between">
            <div>
              <h2 className="headline text-2xl">Volume by Carrier</h2>
              <p className="text-xs text-ink-muted mt-1">Placed orders only · ranked by m³</p>
            </div>
            <a
              href="/api/export/csv?view=carrier_volume_placed"
              className="text-xs uppercase tracking-[0.14em] text-ink-muted hover:text-ink transition-colors"
            >
              Export CSV
            </a>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead>
                <tr className="border-b divider text-left">
                  <th className="px-6 py-4 eyebrow font-medium">Carrier</th>
                  <th className="px-4 py-4 eyebrow font-medium text-right">Shipments</th>
                  <th className="px-4 py-4 eyebrow font-medium text-right">Volume m³</th>
                  <th className="px-4 py-4 eyebrow font-medium text-right">Weight kg</th>
                  <th className="px-4 py-4 eyebrow font-medium text-right">Value £</th>
                  <th className="px-4 py-4 eyebrow font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {carriers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-ink-muted">
                      No carriers found. Check back after the next sync.
                    </td>
                  </tr>
                )}
                {carriers.map((row) => {
                  const isCampeys = (row.carrier_name ?? '').toLowerCase().includes('campey');
                  const share = totals.volume_m3 > 0 ? (row.volume_m3 / totals.volume_m3) * 100 : 0;
                  return (
                    <tr
                      key={row.carrier_name}
                      className={`border-b divider hover:bg-paper-sunk transition-colors ${
                        isCampeys ? 'bg-paper-sunk' : ''
                      }`}
                    >
                      <td className="px-6 py-3.5 font-medium tracking-tight">
                        {row.carrier_name}
                        {isCampeys && (
                          <span className="ml-2 text-xs eyebrow text-accent">primary</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right data-figure text-ink-soft">
                        {row.shipment_count}
                      </td>
                      <td className={`px-4 py-3.5 text-right data-figure ${isCampeys ? 'text-ink font-medium' : 'text-ink'}`}>
                        {formatM3(row.volume_m3)}
                      </td>
                      <td className="px-4 py-3.5 text-right data-figure text-ink-soft">
                        {formatKg(row.weight_kg)}
                      </td>
                      <td className="px-4 py-3.5 text-right data-figure text-ink-soft">
                        {formatGBP(row.total_value)}
                      </td>
                      <td className="px-4 py-3.5 text-right data-figure text-ink-muted">
                        {share.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {carriers.length > 0 && (
                <tfoot>
                  <tr className="bg-paper-sunk">
                    <td className="px-6 py-4 eyebrow font-medium">Total</td>
                    <td className="px-4 py-4 text-right data-figure font-medium">{totals.shipment_count}</td>
                    <td className="px-4 py-4 text-right data-figure font-medium">{formatM3(totals.volume_m3)}</td>
                    <td className="px-4 py-4 text-right data-figure font-medium">{formatKg(totals.weight_kg)}</td>
                    <td className="px-4 py-4 text-right data-figure font-medium">{formatGBP(totals.total_value)}</td>
                    <td className="px-4 py-4 text-right data-figure font-medium">100.0%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        <p className="mt-8 text-xs text-ink-subtle max-w-2xl">
          <span className="eyebrow">A note on shipment volume.</span> Volume is calculated from each line's actual shipped quantity, not the parent order total. This corrects the long-standing flaw in the legacy Power BI report which inherited parent order volumes onto partial shipments.
        </p>
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
