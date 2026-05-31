/**
 * Stock-on-hand sync for the Howden warehouse only.
 *
 * The StockOnHand endpoint returns a flat structure (different from the
 * nested Warehouse objects on other endpoints). Fields used:
 *   - ProductGuid (not Product.Guid)
 *   - WarehouseId (not Warehouse.Guid)
 *   - WarehouseCode (flat field)
 *   - AvailableQty, QtyOnHand, AllocatedQty
 */

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
  let upserted = 0;
  let pages = 0;

  try {
    for await (const page of client.paged<any>(
      '/StockOnHand',
      { warehouseCode: config.howdenWarehouseCode },
      { pageSize: PAGE_SIZE },
    )) {
      pages += 1;

      const rows = page.items
        .filter((s: any) => s.WarehouseCode === config.howdenWarehouseCode)
        .map((s: any) => ({
          product_guid: s.ProductGuid,
          warehouse_guid: s.WarehouseId,
          available_quantity: s.AvailableQty ?? 0,
          on_hand_quantity: s.QtyOnHand ?? 0,
          allocated_quantity: s.AllocatedQty ?? 0,
          last_synced_at: new Date().toISOString(),
        }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('stock_on_hand')
          .upsert(rows, { onConflict: 'product_guid,warehouse_guid' });
        if (error) throw new Error('stock_on_hand upsert: ' + error.message);
        upserted += rows.length;
      }

      processed += page.items.length;
    }

    await completeSyncRun(runId, { recordsProcessed: processed, recordsUpserted: upserted, pagesProcessed: pages });
    return { processed, upserted, pages };
  } catch (e: any) {
    await failSyncRun(runId, e?.message ?? String(e));
    throw e;
  }
}
