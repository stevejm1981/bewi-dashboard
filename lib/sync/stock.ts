import { unleashedClientFromEnv } from '@/lib/unleashed/client';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { getBewiConfig } from '@/lib/config/bewi';
import { startSyncRun, completeSyncRun, failSyncRun } from './sync-runs';

const PAGE_SIZE = 500;

export async function syncStockOnHand(options: { trigger: 'scheduled' | 'manual' | 'reconciliation'; triggeredBy?: string } = { trigger: 'scheduled' }) {
  const runId = await startSyncRun('stock_on_hand', options.trigger, options.triggeredBy);
  const supabase = getSupabaseServiceClient();
  const client = unleashedClientFromEnv();
  const config = await getBewiConfig();

  let processed = 0;
  let pages = 0;
  const seen = new Map<string, any>();

  try {
    for await (const page of client.paged<any>(
      '/StockOnHand',
      { warehouseCode: config.howdenWarehouseCode },
      { pageSize: PAGE_SIZE },
    )) {
      pages += 1;
      processed += page.items.length;

      for (const s of page.items as any[]) {
        if (s.WarehouseCode !== config.howdenWarehouseCode) continue;
        if (!s.ProductGuid || !s.WarehouseId) continue;
        const key = s.ProductGuid + '|' + s.WarehouseId;
        seen.set(key, {
          product_guid: s.ProductGuid,
          warehouse_guid: s.WarehouseId,
          available_quantity: Number(s.AvailableQty ?? 0),
          on_hand_quantity: Number(s.QtyOnHand ?? 0),
          allocated_quantity: Number(s.AllocatedQty ?? 0),
          last_synced_at: new Date().toISOString(),
        });
      }
    }

    const allRows = Array.from(seen.values());

    const { error: deleteError } = await supabase
      .from('stock_on_hand')
      .delete()
      .eq('warehouse_guid', config.howdenWarehouseGuid);

    if (deleteError) throw new Error('stock_on_hand delete: ' + deleteError.message);

    const CHUNK = 1000;
    let inserted = 0;

    for (let i = 0; i < allRows.length; i += CHUNK) {
      const chunk = allRows.slice(i, i + CHUNK);
      const { error: insertError } = await supabase
        .from('stock_on_hand')
        .insert(chunk);

      if (insertError) throw new Error('stock_on_hand insert (chunk ' + (i / CHUNK + 1) + '): ' + insertError.message);
      inserted += chunk.length;
    }

    await completeSyncRun(runId, { recordsProcessed: processed, recordsUpserted: inserted, pagesProcessed: pages });
    return { processed, upserted: inserted, pages };
  } catch (e: any) {
    await failSyncRun(runId, e?.message ?? String(e));
    throw e;
  }
}
