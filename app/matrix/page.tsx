import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { formatM3, formatKg, formatGBP } from '@/lib/volume/calculate';

export const dynamic = 'force-dynamic';

interface MatrixRow {
  product_group_guid: string;
  group_name: string;
  demand_m3: number;
  demand_kg: number;
  demand_value: number;
  stock_m3: number;
  cutting_sc_m3: number;
  cutting_5mcl_m3: number;
  cutting_lpc_m3: number;
  cutting_spc_m3: number;
}

export default async function MatrixPage() {
  const supabase = getSupabaseServerClient();
  const { data: rows } = await supabase.from('v_volume_matrix').select('*');
  const matrix = (rows ?? []) as MatrixRow[];

  // Totals
  const totals = matrix.reduce(
    (acc, r) => ({
      demand_m3: acc.demand_m3 + (r.demand_m3 ?? 0),
      demand_kg: acc.demand_kg + (r.demand_kg ?? 0),
      demand_value: acc.demand_value + (r.demand_value ?? 0),
      stock_m3: acc.stock_m3 + (r.stock_m3 ?? 0),
      cutting_sc_m3: acc.cutting_sc_m3 + (r.cutting_sc_m3 ?? 0),
      cutting_5mcl_m3: acc.cutting_5mcl_m3 + (r.cutting_5mcl_m3 ?? 0),
      cutting_lpc_m3: acc.cutting_lpc_m3 + (r.cutting_lpc_m3 ?? 0),
      cutting_spc_m3: acc.cutting_spc_m3 + (r.cutting_spc_m3 ?? 0),
    }),
    { demand_m3: 0, demand_kg: 0, demand_value: 0, stock_m3: 0, cutting_sc_m3: 0, cutting_5mcl_m3: 0, cutting_lpc_m3: 0, cutting_spc_m3: 0 },
  );

  return (
    <div className="min-h-screen">
      <DashboardHeader active="/matrix" />

      <main className="max-w-[1600px] mx-auto px-8 py-10">
        {/* Headline metrics */}
        <section className="grid grid-cols-4 gap-px bg-line mb-10 surface">
          <Headline label="Open Demand" value={`${formatM3(totals.demand_m3)} m³`} sub={`${formatKg(totals.demand_kg)} kg`} />
          <Headline label="In Stock" value={`${formatM3(totals.stock_m3)} m³`} />
          <Headline label="In Progress" value={`${formatM3(totals.cutting_sc_m3 + totals.cutting_5mcl_m3 + totals.cutting_lpc_m3 + totals.cutting_spc_m3)} m³`} sub="all cutting lines" />
          <Headline label="Demand Value" value={formatGBP(totals.demand_value)} accent />
        </section>

        {/* Matrix table */}
        <section className="surface">
          <header className="px-6 py-5 border-b divider flex items-baseline justify-between">
            <div>
              <div className="eyebrow">Section A</div>
              <h2 className="headline text-2xl mt-1">Volume by Line of Business</h2>
            </div>
            <p className="text-sm text-ink-muted max-w-md text-right">
              All volumes in m³. NetM3 is the authoritative figure where present, with dimensional fallback otherwise.
            </p>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead>
                <tr className="border-b divider text-left">
                  <th className="px-6 py-4 eyebrow font-medium">Line of Business</th>
                  <th className="px-4 py-4 eyebrow font-medium text-right">Demand</th>
                  <th className="px-4 py-4 eyebrow font-medium text-right">In Stock</th>
                  <th className="px-4 py-4 eyebrow font-medium text-right">SC</th>
                  <th className="px-4 py-4 eyebrow font-medium text-right">5MCL</th>
                  <th className="px-4 py-4 eyebrow font-medium text-right">LPC</th>
                  <th className="px-4 py-4 eyebrow font-medium text-right">SPC</th>
                </tr>
              </thead>
              <tbody>
                {matrix.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-ink-muted">
                      No data yet. Run an initial sync to populate the dashboard.
                    </td>
                  </tr>
                )}
                {matrix.map((row) => (
                  <tr key={row.product_group_guid} className="border-b divider hover:bg-paper-sunk transition-colors">
                    <td className="px-6 py-3.5 font-medium tracking-tight">{row.group_name}</td>
                    <Cell value={row.demand_m3} emphasis />
                    <Cell value={row.stock_m3} />
                    <Cell value={row.cutting_sc_m3} />
                    <Cell value={row.cutting_5mcl_m3} />
                    <Cell value={row.cutting_lpc_m3} />
                    <Cell value={row.cutting_spc_m3} />
                  </tr>
                ))}
              </tbody>
              {matrix.length > 0 && (
                <tfoot>
                  <tr className="bg-paper-sunk">
                    <td className="px-6 py-4 eyebrow font-medium">Total</td>
                    <Cell value={totals.demand_m3} emphasis bold />
                    <Cell value={totals.stock_m3} bold />
                    <Cell value={totals.cutting_sc_m3} bold />
                    <Cell value={totals.cutting_5mcl_m3} bold />
                    <Cell value={totals.cutting_lpc_m3} bold />
                    <Cell value={totals.cutting_spc_m3} bold />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        <p className="mt-8 text-xs text-ink-subtle max-w-2xl">
          <span className="eyebrow">A note on shipment volume.</span> The dashboard calculates shipment volume from each line's shipped quantity, not the parent order total. This is intentional and corrects a long-standing flaw in the legacy Power BI report.
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

function Cell({ value, emphasis, bold }: { value: number; emphasis?: boolean; bold?: boolean }) {
  const isZero = !value || value === 0;
  return (
    <td className={`px-4 py-3.5 text-right data-figure ${
      bold ? 'font-medium' : ''
    } ${
      isZero ? 'text-ink-subtle' : emphasis ? 'text-ink' : 'text-ink-soft'
    }`}>
      {formatM3(value)}
    </td>
  );
}
