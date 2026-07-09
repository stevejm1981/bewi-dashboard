/**
 * CSV export endpoint. Streams CSV from a view query.
 *
 * Query params:
 *   - view: one of the keys in VIEW_MAP below
 *
 * Filtering is applied through Supabase query params at /api/export/csv?view=...&filter=...
 * (filter syntax is intentionally simple for the prototype).
 */

import { NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { stringify } from 'csv-stringify/sync';

export const dynamic = 'force-dynamic';

const VIEW_MAP: Record<string, string> = {
  expected_to_ship: 'v_expected_to_ship',
  expected_to_ship_placed: 'v_expected_to_ship_placed',
  open_orders: 'sales_orders',
  open_shipments: 'sales_shipments',
  carrier_volume: 'v_carrier_volume',
  carrier_volume_placed: 'v_carrier_volume_placed',
  volume_matrix: 'v_volume_matrix',
};

export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const view = request.nextUrl.searchParams.get('view') ?? 'expected_to_ship';
  const table = VIEW_MAP[view];
  if (!table) return new Response(`Unknown view: ${view}`, { status: 400 });

  const { data, error } = await supabase.from(table).select('*').limit(10_000);
  if (error) return new Response(`Query failed: ${error.message}`, { status: 500 });
  if (!data || data.length === 0) return new Response('', { status: 200, headers: { 'Content-Type': 'text/csv' } });

  const csv = stringify(data, { header: true });
  const filename = `${view}-${new Date().toISOString().split('T')[0]}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
