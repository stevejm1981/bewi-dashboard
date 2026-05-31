/**
 * Product sync from Unleashed.
 *
 * Uses includeAttributes=true and pageSize=500 (the sweet spot per
 * Unleashed's own guidance against very large pages). Inserts/updates
 * products, product groups, attributes, and warehouse info.
 *
 * Denormalises NetM3 attribute and Category (cutting line) attribute
 * onto convenience columns for query performance.
 */

import { unleashedClientFromEnv } from '@/lib/unleashed/client';
import { parseUnleashedDateOrNull } from '@/lib/unleashed/date-parser';
import type { UnleashedProduct } from '@/lib/unleashed/types';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { startSyncRun, completeSyncRun, failSyncRun } from './sync-runs';

const PAGE_SIZE = 500;
const VALID_CUTTING_LINES = new Set(['SC', '5MCL', 'LPC', 'SPC']);

function extractAttribute(product: UnleashedProduct, name: string): string | null {
  const attrs = product.AttributeSet?.Attributes ?? [];
  const found = attrs.find(a => a.Name === name);
  return found?.Value ?? null;
}

function parseNumericOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  return Number.isNaN(n) ? null : n;
}

export async function syncProducts(options: { trigger: 'scheduled' | 'manual' | 'reconciliation'; triggeredBy?: string } = { trigger: 'scheduled' }) {
  const runId = await startSyncRun('products', options.trigger, options.triggeredBy);
  const supabase = getSupabaseServiceClient();
  const client = unleashedClientFromEnv();

  let processed = 0;
  let upserted = 0;
  let pages = 0;

  try {
    for await (const page of client.paged<UnleashedProduct>(
      '/Products',
      { includeAttributes: true, includeObsolete: true },
      { pageSize: PAGE_SIZE },
    )) {
      pages += 1;

      // Collect product groups separately to upsert
      const productGroups = new Map<string, { guid: string; group_name: string; parent_group_guid: string | null; last_modified_on: string | null }>();
      for (const p of page.items) {
        if (p.ProductGroup) {
          productGroups.set(p.ProductGroup.Guid, {
            guid: p.ProductGroup.Guid,
            group_name: p.ProductGroup.GroupName,
            parent_group_guid: p.ProductGroup.ParentGroupGuid,
            last_modified_on: parseUnleashedDateOrNull(p.ProductGroup.LastModifiedOn),
          });
        }
      }

      if (productGroups.size > 0) {
        const { error } = await supabase
          .from('product_groups')
          .upsert([...productGroups.values()], { onConflict: 'guid' });
        if (error) throw new Error(`product_groups upsert failed: ${error.message}`);
      }

      // Upsert products
      const productRows = page.items.map(p => {
        const netM3 = parseNumericOrNull(extractAttribute(p, 'NetM3'));
        const cuttingRaw = extractAttribute(p, 'Category');
        const cuttingLine = cuttingRaw && VALID_CUTTING_LINES.has(cuttingRaw) ? cuttingRaw : null;

        return {
          guid: p.Guid,
          product_code: p.ProductCode,
          product_description: p.ProductDescription,
          product_group_guid: p.ProductGroup?.Guid ?? null,
          width: p.Width,
          height: p.Height,
          depth: p.Depth,
          weight: p.Weight,
          pack_size: p.PackSize,
          unit_of_measure: p.UnitOfMeasure?.Name ?? null,
          is_sellable: p.IsSellable,
          obsolete: p.Obsolete,
          net_m3: netM3,
          cutting_line: cuttingLine,
          last_synced_at: new Date().toISOString(),
        };
      });

      if (productRows.length > 0) {
        const { error } = await supabase
          .from('products')
          .upsert(productRows, { onConflict: 'guid' });
        if (error) throw new Error(`products upsert failed: ${error.message}`);
        upserted += productRows.length;
      }

      // Upsert product attributes (full set)
      const attrRows: Array<{ product_guid: string; attribute_name: string; attribute_value: string | null; attribute_guid: string | null; is_required: boolean }> = [];
      for (const p of page.items) {
        const attrs = p.AttributeSet?.Attributes ?? [];
        for (const a of attrs) {
          attrRows.push({
            product_guid: p.Guid,
            attribute_name: a.Name,
            attribute_value: a.Value,
            attribute_guid: a.Guid,
            is_required: a.IsRequired,
          });
        }
      }
      if (attrRows.length > 0) {
        const { error } = await supabase
          .from('product_attributes')
          .upsert(attrRows, { onConflict: 'product_guid,attribute_name' });
        if (error) throw new Error(`product_attributes upsert failed: ${error.message}`);
      }

      // Upsert warehouse info per product
      const whInfoRows: Array<{ product_guid: string; warehouse_guid: string; bin_location: string | null; min_stock_alert: number | null; max_stock_alert: number | null }> = [];
      for (const p of page.items) {
        for (const inv of p.InventoryDetails ?? []) {
          whInfoRows.push({
            product_guid: p.Guid,
            warehouse_guid: inv.Warehouse.Guid,
            bin_location: inv.BinLocation,
            min_stock_alert: inv.WarehouseMinStockAlertLevel,
            max_stock_alert: inv.WarehouseMaxStockAlertLevel,
          });
        }
      }
      if (whInfoRows.length > 0) {
        // Make sure warehouses referenced exist (skip silently for the prototype)
        await supabase
          .from('warehouses')
          .upsert(
            page.items.flatMap(p => (p.InventoryDetails ?? []).map(i => ({
              guid: i.Warehouse.Guid,
              warehouse_code: i.Warehouse.WarehouseCode,
              warehouse_name: i.Warehouse.WarehouseName,
              obsolete: false,
            }))),
            { onConflict: 'guid' },
          );
        const { error } = await supabase
          .from('product_warehouse_info')
          .upsert(whInfoRows, { onConflict: 'product_guid,warehouse_guid' });
        if (error) throw new Error(`product_warehouse_info upsert failed: ${error.message}`);
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
