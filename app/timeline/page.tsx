import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { TimelineChart } from '@/components/dashboard/TimelineChart';

export const dynamic = 'force-dynamic';

export default async function TimelinePage() {
  const supabase = getSupabaseServerClient();

  const [{ data: soTimeline }, { data: woTimeline }] = await Promise.all([
    supabase.from('v_so_timeline').select('*'),
    supabase.from('v_works_order_timeline').select('*'),
  ]);

  return (
    <div className="min-h-screen">
      <DashboardHeader active="/timeline" />

      <main className="max-w-[1600px] mx-auto px-8 py-10 space-y-12">
        <section>
          <header className="mb-6">
            <div className="eyebrow">Section C · Sales Orders</div>
            <h1 className="headline text-4xl mt-1">Open Demand by <em className="not-italic font-medium">Ship Date</em></h1>
            <p className="mt-3 text-sm text-ink-muted max-w-2xl">
              Open sales order volume plotted by required ship date, broken down by line of business.
            </p>
          </header>
          <div className="surface p-6">
            <TimelineChart
              data={(soTimeline ?? []) as any[]}
              xKey="required_date"
              valueKey="volume_m3"
              seriesKey="group_name"
              emptyLabel="No open sales orders with a required date."
            />
          </div>
        </section>

        <section>
          <header className="mb-6">
            <div className="eyebrow">Section D · Works Orders</div>
            <h2 className="headline text-4xl mt-1">In-Progress by <em className="not-italic font-medium">Completion</em></h2>
            <p className="mt-3 text-sm text-ink-muted max-w-2xl">
              In-progress works order volume by cutting line, plotted by expected completion date.
            </p>
          </header>
          <div className="surface p-6">
            <TimelineChart
              data={(woTimeline ?? []) as any[]}
              xKey="expected_date"
              valueKey="volume_m3"
              seriesKey="cutting_line"
              emptyLabel="No works orders with an expected completion date."
            />
          </div>
        </section>
      </main>
    </div>
  );
}
