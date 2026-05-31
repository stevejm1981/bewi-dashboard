/**
 * Works Order CSV ingestion.
 *
 * Snapshot semantics: each post is the current full state of in-progress
 * works orders. Records present in the previous post but absent here are
 * marked missing_from_feed (not deleted) for diagnostic visibility.
 *
 * Idempotent upsert keyed on works_order_id. Unmatched SKUs are
 * quarantined rather than failing the whole ingest.
 */

import { parse } from 'csv-parse/sync';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

const VALID_CUTTING_LINES = new Set(['SC', '5MCL', 'LPC', 'SPC']);

export interface IngestResult {
  runId: string;
  rowCount: number;
  upsertedCount: number;
  quarantinedCount: number;
  markedMissingCount: number;
}

export async function ingestWorksOrderCsv(
  csv: string,
  options: { sourceIp?: string } = {},
): Promise<IngestResult> {
  const supabase = getSupabaseServiceClient();

  // Start ingest run row
  const { data: runRow, error: runErr } = await supabase
    .from('works_order_ingest_runs')
    .insert({ source_ip: options.sourceIp ?? null })
    .select('id')
    .single();
  if (runErr || !runRow) throw new Error(`Failed to record ingest run: ${runErr?.message}`);
  const runId = runRow.id as string;

  try {
    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    // Build map of SKU -> product_guid for the SKUs present in the payload
    const skus = [...new Set(records.map(r => r.sku).filter(Boolean))];
    const productMap = new Map<string, string>();
    if (skus.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('guid, product_code')
        .in('product_code', skus);
      for (const p of products ?? []) {
        productMap.set(p.product_code, p.guid);
      }
    }

    // Partition records into upsert candidates and quarantine
    const validRows: any[] = [];
    const quarantineRows: any[] = [];
    const seenIds = new Set<string>();

    for (const r of records) {
      const woId = r.works_order_id;
      const sku = r.sku;
      const qtyStr = r.quantity;
      const cuttingLine = r.cutting_line;

      const failure =
        !woId ? 'Missing works_order_id'
        : !sku ? 'Missing sku'
        : !productMap.has(sku) ? `SKU "${sku}" not found in product catalogue`
        : !cuttingLine ? 'Missing cutting_line'
        : !VALID_CUTTING_LINES.has(cuttingLine) ? `Invalid cutting_line: ${cuttingLine}`
        : Number.isNaN(Number.parseFloat(qtyStr)) ? `Invalid quantity: ${qtyStr}`
        : null;

      if (failure) {
        quarantineRows.push({
          works_order_id: woId ?? null,
          sku: sku ?? null,
          raw_row: r,
          failure_reason: failure,
          ingest_run_id: runId,
        });
        continue;
      }

      seenIds.add(woId);
      validRows.push({
        works_order_id: woId,
        sku,
        product_guid: productMap.get(sku),
        quantity: Number.parseFloat(qtyStr),
        cutting_line: cuttingLine,
        status: r.status ?? 'In Progress',
        app_created_at: r.created_at || null,
        expected_completion_at: r.expected_completion_at || null,
        completed_at: r.completed_at || null,
        missing_from_feed: false,
        last_seen_at: new Date().toISOString(),
      });
    }

    if (validRows.length > 0) {
      const { error } = await supabase
        .from('works_orders')
        .upsert(validRows, { onConflict: 'works_order_id' });
      if (error) throw new Error(`works_orders upsert: ${error.message}`);
    }

    if (quarantineRows.length > 0) {
      await supabase.from('works_order_quarantine').insert(quarantineRows);
    }

    // Mark records not in this snapshot as missing_from_feed (only those
    // that are not already terminal)
    let markedMissing = 0;
    if (seenIds.size > 0) {
      const { data: existing } = await supabase
        .from('works_orders')
        .select('works_order_id')
        .eq('missing_from_feed', false);

      const toMark = ((existing ?? []) as Array<{ works_order_id: string }>)
        .filter((r) => !seenIds.has(r.works_order_id))
        .map((r) => r.works_order_id);

      if (toMark.length > 0) {
        const { error } = await supabase
          .from('works_orders')
          .update({ missing_from_feed: true })
          .in('works_order_id', toMark);
        if (!error) markedMissing = toMark.length;
      }
    }

    // Finalise run row
    await supabase
      .from('works_order_ingest_runs')
      .update({
        completed_at: new Date().toISOString(),
        row_count: records.length,
        upserted_count: validRows.length,
        quarantined_count: quarantineRows.length,
        marked_missing_count: markedMissing,
      })
      .eq('id', runId);

    return {
      runId,
      rowCount: records.length,
      upsertedCount: validRows.length,
      quarantinedCount: quarantineRows.length,
      markedMissingCount: markedMissing,
    };
  } catch (e: any) {
    await supabase
      .from('works_order_ingest_runs')
      .update({
        completed_at: new Date().toISOString(),
        error: e?.message ?? String(e),
      })
      .eq('id', runId);
    throw e;
  }
}
