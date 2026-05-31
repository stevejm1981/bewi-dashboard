import { unleashedClientFromEnv } from '@/lib/unleashed/client';
import { parseUnleashedDateOrNull } from '@/lib/unleashed/date-parser';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { getBewiConfig } from '@/lib/config/bewi';
import { startSyncRun, completeSyncRun, failSyncRun } from './sync-runs';

const PAGE_SIZE = 200;
const OPEN_SHIPMENT_STATUSES = ['Parked', 'Placed', 'Picking', 'Picked', 'Packed', 'Sent'];

function toDateOnly(iso: string | null): string | null {
  return iso ? iso.substring(0, 10) : null;
}

export async function syncShipments(options: { trigger: 'scheduled' | 'manual' | 'reconciliation'; triggeredBy?: string } = { trigger: 'scheduled' }) {
  const runId = await startSyncRun('sales_shipments', options.trigger, options.triggeredBy);
  const supabase = getSupabaseServiceClient();
  const client = unleashedClientFromEnv();
  const config = await getBewiConfig();

  let processed = 0;
  let upserted = 0;
  let pages = 0;

  try {
    for (const status of OPEN_SHIPMENT_STATUSES) {
      for await (const page of client.paged<any>(
        '/SalesShipments',
        { warehouseGuid: config.howdenWarehouseGuid, shipmentStatus: status },
        { pageSize: PAGE_SIZE },
      )) {
        pages += 1;

        const openShipments = page.items.filter(
          (s: any) => s.ShipmentStatus !== 'Dispatched' && s.Warehouse?.Guid === config.howdenWarehouseGuid,
        );

        if (openShipments.length === 0) {
          processed += page.items.length;
          continue;
        }

        const customers = new Map<string, any>();
        for (const s of openShipments) {
          if (s.Customer?.Guid) {
            customers.set(s.Customer.Guid, {
              guid: s.Customer.Guid,
              customer_code: s.Customer.CustomerCode ?? '',
              customer_name: s.Customer.CustomerName ?? '',
              obsolete: false,
            });
          }
        }
        if (customers.size > 0) {
          await supabase.from('customers').upsert([...customers.values()], { onConflict: 'guid' });
        }

        const shipmentRows = openShipments.map((s: any) => ({
          guid: s.Guid,
          shipment_number: s.ShipmentNumber,
          shipment_status: s.ShipmentStatus,
          order_guid: s.OrderGuid,
          order_number: s.OrderNumber,
          customer_guid: s.Customer?.Guid ?? null,
          warehouse_guid: s.Warehouse?.Guid ?? null,
          carrier_name: s.ShippingCompany?.Name ?? null,
          shipment_method: s.TrackingNumber ?? null,
          required_date: toDateOnly(parseUnleashedDateOrNull(s.DispatchDate)),
          shipment_date: toDateOnly(parseUnleashedDateOrNull(s.DispatchDate)),
          last_modified_on: parseUnleashedDateOrNull(s.LastModifiedOn),
          last_synced_at: new Date().toISOString(),
        }));

        if (shipmentRows.length > 0) {
          const { error } = await supabase
            .from('sales_shipments')
            .upsert(shipmentRows, { onConflict: 'guid' });
          if (error) throw new Error('sales_shipments upsert: ' + error.message);
          upserted += shipmentRows.length;
        }

        const lineRows = openShipments.flatMap((s: any) =>
          (s.SalesShipmentLines ?? []).map((l: any) => ({
            guid: l.Guid,
            shipment_guid: s.Guid,
            product_guid: l.Product?.Guid ?? null,
            order_line_guid: null,
            line_number: l.LineNumber,
            shipped_quantity: l.ShipmentQty,
            unit_price: l.UnitCost,
            line_total: l.CommercialMonetaryValue,
          })),
        );
        if (lineRows.length > 0) {
          const { error } = await supabase
            .from('sales_shipment_lines')
            .upsert(lineRows, { onConflict: 'guid' });
          if (error) throw new Error('sales_shipment_lines upsert: ' + error.message);
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