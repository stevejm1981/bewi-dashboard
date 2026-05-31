/**
 * Sync orchestrator. Runs all entity syncs in a sensible order:
 *   products & customers first (reference data), then sales orders,
 *   shipments, and stock-on-hand.
 *
 * The "operational" mode (used by the manual refresh button and scheduled
 * cron) skips the product sync since products change rarely - this keeps
 * the manual refresh fast.
 */

import { syncProducts } from './products';
import { syncSalesOrders } from './sales-orders';
import { syncShipments } from './shipments';
import { syncStockOnHand } from './stock';

export type SyncMode = 'full' | 'operational';
export type SyncTrigger = 'scheduled' | 'manual' | 'reconciliation';

export interface SyncResult {
  mode: SyncMode;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  entities: Record<string, { processed: number; upserted: number; pages: number } | { error: string }>;
}

export async function runSync(
  mode: SyncMode,
  trigger: SyncTrigger,
  triggeredBy?: string,
): Promise<SyncResult> {
  const startedAt = new Date();
  const entities: SyncResult['entities'] = {};

  // For operational sync, skip product sync (slow, large catalogue)
  if (mode === 'full') {
    try {
      entities.products = await syncProducts({ trigger, triggeredBy });
    } catch (e: any) {
      entities.products = { error: e?.message ?? String(e) };
    }
  }

  try {
    entities.sales_orders = await syncSalesOrders({ trigger, triggeredBy });
  } catch (e: any) {
    entities.sales_orders = { error: e?.message ?? String(e) };
  }

  try {
    entities.sales_shipments = await syncShipments({ trigger, triggeredBy });
  } catch (e: any) {
    entities.sales_shipments = { error: e?.message ?? String(e) };
  }

  try {
    entities.stock_on_hand = await syncStockOnHand({ trigger, triggeredBy });
  } catch (e: any) {
    entities.stock_on_hand = { error: e?.message ?? String(e) };
  }

  const completedAt = new Date();
  return {
    mode,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    entities,
  };
}
