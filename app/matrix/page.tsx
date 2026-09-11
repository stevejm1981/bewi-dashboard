import { Suspense } from 'react';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { InfoTooltip } from '@/components/dashboard/InfoTooltip';
import { MatrixFilters } from '@/components/dashboard/MatrixFilters';
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

const TH = 'sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#e7e5e4] px-4 py-4 eyebrow font-medium';

function isIsoDate(v: string | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export default async function MatrixPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; status?: string };
}) {
  const supabase = getSupabaseServerClient();

  // Filters from the URL (absent = unfiltered consolidated view)
  const dateFrom = isIsoDate(searchParams.from) ? searchParams.from : null;
  const dateTo = isIsoDate(searchParams.to) ? searchParams.to : null;
  const statuses = (searchParams.status ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const isFiltered = !!(dateFrom || dateTo || statuses.length);

  // Matrix rows via the parameterised function
  const { data: rows } = await supabase.rpc('f_volume_matrix', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_statuses: statuses.length ? statuses : null,
  });
  const matrix = (rows ?? []) as MatrixRow[];

  // Statuses present in the data, for the filter options
  const { data: statusRows } = await supabase.rpc('f_sales_order_statuses');
  const statusOptions = ((statusRows ?? []) as Array<{ order_status: string }>)
    .map((r) => r.order_status)
    .filter(Boolean);

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

  const filterSummary = [
    dateFrom && dateTo ? `orders ${dateFrom} to ${dateTo}` : dateFrom ? `orders from ${dateFrom}` : dateTo ? `orders to ${dateTo}` : null,
    statuses.length ? `status ${statuses.join(', ')}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen">
      <DashboardHeader active="/matrix" />

      <main className="max-w-[1600px] mx-auto px-8 py-10">
        <section className="grid grid-cols-4 gap-px bg-line mb-10 surface">
          <Headline
            label="Open Demand"
            value={`${formatM3(totals.demand_m3)} m³`}
            sub={`${formatKg(totals.demand_kg)} kg`}
            tooltip="Total volume on open sales orders at Howden that has not yet been dispatched. Open means Parked, Placed, Backordered, Picking, Picked or Packed. The figure below is the same demand as weight. Responds to the date and status filters."
          />
          <Headline
            label="Qty on Hand"
            value={`${formatM3(totals.stock_m3)} m³`}
            tooltip="Total physical stock currently in the warehouse, before any allocation to open orders is subtracted. A live snapshot, so it is not affected by the date or status filters."
          />
          <Headline
            label="In Progress"
            value={`${formatM3(totals.cutting_sc_m3 + totals.cutting_5mcl_m3 + totals.cutting_lpc_m3 + totals.cutting_spc_m3)} m³`}
            sub="all cutting lines"
            tooltip="Total volume of works orders currently being produced. Finished product being made that becomes stock once complete. Not linked to a sales order date, so not affected by the filters."
          />
          <Headline
            label="Demand Value"
            value={formatGBP(totals.demand_value)}
            accent
            tooltip="The net sales value (£) of all open demand at Howden. Responds to the date and status filters."
          />
        </section>

        <section className="surface">
          <header className="px-6 py-5 border-b divider flex items-baseline justify-between">
            <div>
              <div className="eyebrow">Section A</div>
              <h2 className="headline text-2xl mt-1">Volume by Line of Business</h2>
              {isFiltered && (
                <div className="text-xs mt-1 tabular" style={{ color: '#525252' }}>Filtered: {filterSummary}</div>
              )}
            </div>
            <p className="text-sm text-ink-muted max-w-md text-right">
              All volumes in m³. NetM3 is the authoritative figure where present, with dimensional fallback otherwise.
            </p>
          </header>

          <Suspense fallback={null}>
            <MatrixFilters statuses={statusOptions} />
          </Suspense>

          <div className="overflow-auto max-h-[75vh]">
            <table className="w-full text-sm tabular">
              <thead>
                <tr className="border-b divider text-left">
                  <th className={`${TH} px-6 text-left`}>Line of Business</th>
                  <th className={`${TH} text-right`}>Demand m³</th>
                  <th className={`${TH} text-right`}>Net Sale £</th>
                  <th className={`${TH} text-right`}>Kg</th>
                  <th className={`${TH} text-right`}>Qty on Hand</th>
                  <th className={`${TH} text-right`}>SC</th>
                  <th className={`${TH} text-right`}>5MCL</th>
                  <th className={`${TH} text-right`}>LPC</th>
                  <th className={`${TH} text-right`}>SPC</th>
                </tr>
              </thead>
              <tbody>
                {matrix.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-ink-muted">
                      No data for the current filters.
                    </td>
                  </tr>
                )}
                {matrix.map((row) => (
                  <tr key={row.product_group_guid} className="border-b divider hover:bg-paper-sunk transition-colors">
                    <td className="px-6 py-3.5 font-medium tracking-tight">{row.group_name}</td>
                    <Cell value={row.demand_m3} emphasis />
                    <td className="px-4 py-3.5 text-right data-figure text-ink-soft">{formatGBP(row.demand_value)}</td>
                    <td className="px-4 py-3.5 text-right data-figure text-ink-soft">{formatKg(row.demand_kg)}</td>
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
                    <td className="px-4 py-4 text-right data-figure font-medium">{formatGBP(totals.demand_value)}</td>
                    <td className="px-4 py-4 text-right data-figure font-medium">{formatKg(totals.demand_kg)}</td>
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
          <span className="eyebrow">Filters.</span> The date and status filters apply to the sales order figures (Demand m³, Net Sale £, Kg). Qty on Hand is a live stock snapshot and the cutting line columns come from works orders, so those always show the current position.
        </p>
        <p className="mt-3 text-xs text-ink-subtle max-w-2xl">
          <span className="eyebrow">A note on shipment volume.</span> The dashboard calculates shipment volume from each line's shipped quantity, not the parent order total. This is intentional and corrects a long-standing flaw in the legacy Power BI report.
        </p>
      </main>
    </div>
  );
}

function Headline({ label, value, sub, accent, tooltip }: { label: string; value: string; sub?: string; accent?: boolean; tooltip?: string }) {
  return (
    <div className="bg-paper-card p-6">
      <div className="eyebrow flex items-center">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
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
