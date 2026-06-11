import { NextResponse } from 'next/server';
import { unleashedClientFromEnv } from '@/lib/unleashed/client';
import { getBewiConfig } from '@/lib/config/bewi';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = unleashedClientFromEnv();
  const config = await getBewiConfig();
  const target = '1a3cd092-f934-4b6b-8972-a14847c945ca';
  const found: any[] = [];
  let pages = 0;
  let total = 0;

  for await (const page of client.paged<any>(
    '/StockOnHand',
    { warehouseCode: config.howdenWarehouseCode },
    { pageSize: 500 },
  )) {
    pages += 1;
    total += page.items.length;
    for (const s of page.items) {
      if (s.ProductGuid === target) {
        found.push({ page: pages, QtyOnHand: s.QtyOnHand, AllocatedQty: s.AllocatedQty, AvailableQty: s.AvailableQty });
      }
    }
  }

  return NextResponse.json({
    apiIdPrefix: (process.env.UNLEASHED_API_ID ?? '').substring(0, 8),
    warehouseCode: config.howdenWarehouseCode,
    pages,
    total,
    target: found,
  });
}
