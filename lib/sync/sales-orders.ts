import { unleashedClientFromEnv } from '@/lib/unleashed/client';
import { parseUnleashedDateOrNull } from '@/lib/unleashed/date-parser';
import type { UnleashedSalesOrder } from '@/lib/unleashed/types';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { getBewiConfig } from '@/lib/config/bewi';
import { startSyncRun, completeSyncRun, failSyncRun } from './sync-runs';

const PAGE_SIZE = 200;
const OPEN_STATUSES = ['Parked', 'Placed', 'Backordered', 'Picking', 'Picked', 'Packed'];

function toDateOnly(iso: string | null): string | null {
  return iso ? iso.substring(0, 10) : null;
}

export async function syncSalesOrders(options: { trigger: 'scheduled' | 'manual' | 'reconciliation'; triggeredBy?: string } = { trigger: 'scheduled' }) {
  const runId = await startSyncRun('sales_orders', options.trigger, options.triggeredBy);
  const supabase = getSupabaseServiceClient();
  const client = unleashedClientFromEnv();
  const config = await getBewiConfig();
  let processed = 0; let upserted = 0; let pages = 0;
  try {
    for (const status of OPEN_STATUSES) {
      for await (const page of client.paged<UnleashedSalesOrder>('/SalesOrders', { warehouseGuid: config.howdenWarehouseGuid, orderStatus: status }, { pageSize: PAGE_SIZE })) {
        pages += 1;
        const openOrders = page.items.filter((o: any) => o.Warehouse?.Guid === config.howdenWarehouseGuid);
        if (openOrders.length === 0) { processed += page.items.length; continue; }
        const customers = new Map<string, any>();
        for (const o of openOrders) {
          if (o.Customer?.Guid) {
            customers.set(o.Customer.Guid, { guid: o.Customer.Guid, customer_code: (o.Customer as any).CustomerCode ?? '', customer_name: (o.Customer as any).CustomerName ?? o.Customer.Name ?? '', obsolete: false });
          }
        }
        if (customers.size > 0) { await supabase.from('customers').upsert([...customers.values()], { onConflict: 'guid' }); }
        const orderRows = openOrders.map(o => ({ guid: o.Guid, order_number: o.OrderNumber, order_status: o.OrderStatus, customer_guid: o.Customer?.Guid ?? null, warehouse_guid: o.Warehouse?.Guid ?? null, order_date: toDateOnly(parseUnleashedDateOrNull(o.OrderDate)), required_date: toDateOnly(parseUnleashedDateOrNull(o.RequiredDate)), sub_total: o.SubTotal, tax_total: o.TaxTotal, total: o.Total, currency_code: o.Currency?.CurrencyCode ?? null, last_modified_on: parseUnleashedDateOrNull(o.LastModifiedOn), last_synced_at: new Date().toISOString() }));
        if (orderRows.length > 0) {
          const { error } = await supabase.from('sales_orders').upsert(orderRows, { onConflict: 'guid' });
          if (error) throw new Error('sales_orders upsert: ' + error.message);
          upserted += orderRows.length;
        }
        const lineRows = openOrders.flatMap(o => (o.SalesOrderLines ?? []).map(l => ({ guid: l.Guid, order_guid: o.Guid, product_guid: l.Product?.Guid ?? null, line_number: l.LineNumber, order_quantity: l.OrderQuantity, unit_price: l.UnitPrice, line_total: l.LineTotal, line_tax: l.LineTax, comments: l.Comments })));
        if (lineRows.length > 0) {
          const { error } = await supabase.from('sales_order_lines').upsert(lineRows, { onConflict: 'guid' });
          if (error) throw new Error('sales_order_lines upsert: ' + error.message);
        }
        processed += page.items.length;
      }
    }
    await completeSyncRun(runId, { recordsProcessed: processed, recordsUpserted: upserted, pagesProcessed: pages });
    return { processed, upserted, pages };
  } catch (e: any) {
    await failSyncRun(runId, e?.message ?? String(e));
    throw e;
  }
}
