/**
 * Works Order ingestion endpoint (JSON).
 *
 * The Works Order App POSTs the full set of in-progress works orders for
 * Howden as a JSON snapshot. Each post is authoritative: any works order
 * previously seen but absent from this post is marked missing_from_feed
 * (soft delete), so completed orders drop off the dashboard automatically
 * and their finished stock appears via the Unleashed inventory sync.
 *
 * Auth: X-API-Key header, checked against WORKS_ORDER_INGEST_SECRET.
 *
 * Volume: m3 = quantity * net_m3. net_m3 is taken from the payload when
 * present (authoritative, from the app), falling back to the product's
 * net_m3 in our products table. A line with no usable net_m3 is quarantined
 * rather than allowed to contribute zero silently (this catches any kg-based
 * expansion line that should have been excluded upstream).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HOWDEN_WAREHOUSE_CODE = 'S03';

interface IncomingWorksOrder {
  assembly_number?: string;
  product_code?: string;
  output_quantity?: number;
  net_m3?: number | null;
  production_line?: string | null;
  required_date?: string | null;
}

interface IncomingPayload {
  warehouse_code?: string;
  generated_at?: string;
  works_orders?: IncomingWorksOrder[];
}

export async function POST(request: NextRequest) {
  const providedKey = request.headers.get('x-api-key');
  const expectedKey = process.env.WORKS_ORDER_INGEST_SECRET;

  if (!expectedKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  if (!providedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  const sourceIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null;

  // Open an ingest run record
  const { data: runRow, error: runError } = await supabase
    .from('works_order_ingest_runs')
    .insert({ started_at: new Date().toISOString(), source_ip: sourceIp })
    .select('id')
    .single();

  if (runError || !runRow) {
    return NextResponse.json({ error: 'Could not open ingest run: ' + (runError?.message ?? 'unknown') }, { status: 500 });
  }
  const runId = runRow.id as string;

  try {
    let payload: IncomingPayload;
    try {
      payload = (await request.json()) as IncomingPayload;
    } catch {
      throw new Error('Body is not valid JSON');
    }

    if (payload.warehouse_code && payload.warehouse_code !== HOWDEN_WAREHOUSE_CODE) {
      throw new Error(`Unexpected warehouse_code "${payload.warehouse_code}" (this endpoint serves ${HOWDEN_WAREHOUSE_CODE})`);
    }

    const incoming = Array.isArray(payload.works_orders) ? payload.works_orders : [];
    const rowCount = incoming.length;

    const now = new Date().toISOString();

    // Resolve product GUIDs and fallback net_m3 in one lookup, keyed by product_code
    const codes = Array.from(
      new Set(incoming.map((w) => (w.product_code ?? '').trim()).filter((c) => c.length > 0)),
    );

    const productByCode = new Map<string, { guid: string; net_m3: number | null }>();
    if (codes.length > 0) {
      const { data: products, error: prodError } = await supabase
        .from('products')
        .select('guid, product_code, net_m3')
        .in('product_code', codes);
      if (prodError) throw new Error('Product lookup failed: ' + prodError.message);
      for (const p of products ?? []) {
        productByCode.set(p.product_code, { guid: p.guid, net_m3: p.net_m3 });
      }
    }

    const validRows: any[] = [];
    const quarantineRows: any[] = [];
    const seenIds = new Set<string>();

    for (const w of incoming) {
      const worksOrderId = (w.assembly_number ?? '').trim();
      const sku = (w.product_code ?? '').trim();
      const quantity = typeof w.output_quantity === 'number' ? w.output_quantity : null;
      const product = productByCode.get(sku);

      // net_m3: payload first, then product table
      const payloadNetM3 = typeof w.net_m3 === 'number' ? w.net_m3 : null;
      const resolvedNetM3 = payloadNetM3 ?? product?.net_m3 ?? null;

      const missingFields: string[] = [];
      if (!worksOrderId) missingFields.push('assembly_number');
      if (!sku) missingFields.push('product_code');
      if (quantity === null) missingFields.push('output_quantity');
      if (resolvedNetM3 === null) missingFields.push('net_m3 (no payload value and no product match)');

      if (missingFields.length > 0) {
        quarantineRows.push({
          works_order_id: worksOrderId || null,
          sku: sku || null,
          raw_row: w,
          failure_reason: 'Missing/unusable: ' + missingFields.join(', '),
          ingest_run_id: runId,
          created_at: now,
        });
        continue;
      }

      // Guard against duplicate assembly numbers in one payload (last wins)
      seenIds.add(worksOrderId);

      validRows.push({
        works_order_id: worksOrderId,
        sku,
        product_guid: product?.guid ?? null,
        quantity,
        net_m3: resolvedNetM3,
        cutting_line: (w.production_line ?? '').trim() || null,
        status: 'in_progress',
        is_terminal: false,
        expected_completion_at: w.required_date ? new Date(w.required_date).toISOString() : null,
        missing_from_feed: false,
        last_seen_at: now,
        updated_at: now,
      });
    }

    // Upsert the valid works orders (keyed on works_order_id)
    let upsertedCount = 0;
    if (validRows.length > 0) {
      const { error: upsertError } = await supabase
        .from('works_orders')
        .upsert(validRows, { onConflict: 'works_order_id' });
      if (upsertError) throw new Error('Works order upsert failed: ' + upsertError.message);
      upsertedCount = validRows.length;
    }

    // Reconciliation: mark anything not in this snapshot as missing_from_feed.
    // These have completed in the app since the last post.
    const seenList = Array.from(seenIds);
    let markedMissingCount = 0;
    {
      let query = supabase
        .from('works_orders')
        .update({ missing_from_feed: true, updated_at: now })
        .eq('missing_from_feed', false);

      if (seenList.length > 0) {
        // Postgrest "not in" via not.in filter
        const inList = '(' + seenList.map((id) => '"' + id.replace(/"/g, '') + '"').join(',') + ')';
        query = query.not('works_order_id', 'in', inList);
      }

      const { data: marked, error: markError } = await query.select('works_order_id');
      if (markError) throw new Error('Reconciliation failed: ' + markError.message);
      markedMissingCount = marked?.length ?? 0;
    }

    // Write quarantine rows
    if (quarantineRows.length > 0) {
      const { error: qError } = await supabase.from('works_order_quarantine').insert(quarantineRows);
      if (qError) throw new Error('Quarantine write failed: ' + qError.message);
    }

    // Close the ingest run
    await supabase
      .from('works_order_ingest_runs')
      .update({
        completed_at: new Date().toISOString(),
        row_count: rowCount,
        upserted_count: upsertedCount,
        quarantined_count: quarantineRows.length,
        marked_missing_count: markedMissingCount,
      })
      .eq('id', runId);

    return NextResponse.json({
      ok: true,
      run_id: runId,
      received: rowCount,
      upserted: upsertedCount,
      quarantined: quarantineRows.length,
      marked_missing: markedMissingCount,
    });
  } catch (e: any) {
    const message = e?.message ?? String(e);
    await supabase
      .from('works_order_ingest_runs')
      .update({ completed_at: new Date().toISOString(), error: message })
      .eq('id', runId);
    return NextResponse.json({ error: message, run_id: runId }, { status: 400 });
  }
}
