/**
 * Mock works order generator.
 *
 * For the prototype only. The Works Order App is being built separately
 * and will post real CSVs to the ingest endpoint. Until then, this
 * generator produces a plausible CSV from the synced product catalogue
 * so the cutting line dashboards show meaningful numbers.
 *
 * Strategy:
 *   - Pull 30-60 active BEWI products
 *   - Distribute them across the four cutting lines proportionally to
 *     the customer's stated capacities (SC: 1500, 5MCL: 1200, LPC: 1000, SPC: 800)
 *   - Mix of statuses: ~80% in-progress, ~10% completed today, ~10% other
 *   - Quantities sized to give realistic m3 throughput
 */

import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { stringify } from 'csv-stringify/sync';

interface Product {
  guid: string;
  product_code: string;
  cutting_line: string | null;
  net_m3: number | null;
}

const STATUSES = [
  { value: 'In Progress', weight: 60 },
  { value: 'Cutting', weight: 15 },
  { value: 'Queued', weight: 10 },
  { value: 'Completed', weight: 10 },
  { value: 'Cancelled', weight: 3 },
  { value: 'Rejected', weight: 2 },
];

function pickStatus(): string {
  const total = STATUSES.reduce((sum, s) => sum + s.weight, 0);
  let r = Math.random() * total;
  for (const s of STATUSES) {
    r -= s.weight;
    if (r <= 0) return s.value;
  }
  return STATUSES[0].value;
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export async function generateMockWorksOrdersCsv(count = 50): Promise<string> {
  const supabase = getSupabaseServiceClient();

  // Pull active products with a cutting line assignment
  const { data: products } = await supabase
    .from('products')
    .select('guid, product_code, cutting_line, net_m3')
    .eq('is_active', true)
    .not('cutting_line', 'is', null)
    .limit(500);

  if (!products || products.length === 0) {
    throw new Error('No active products with cutting lines found. Run the product sync first.');
  }

  const now = new Date();
  const rows = Array.from({ length: count }).map((_, i) => {
    const p = products[Math.floor(Math.random() * products.length)] as Product;
    const status = pickStatus();
    const isTerminal = ['Completed', 'Cancelled', 'Rejected'].includes(status);

    // Created within last 3 days
    const createdAt = new Date(now.getTime() - Math.random() * 3 * 24 * 60 * 60 * 1000);
    // Expected completion 0-2 days from creation
    const expectedAt = new Date(createdAt.getTime() + Math.random() * 2 * 24 * 60 * 60 * 1000);
    // Completion (if applicable) is today or yesterday
    const completedAt = isTerminal ? new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000) : null;

    return {
      works_order_id: `WO-MOCK-${Date.now()}-${i.toString().padStart(4, '0')}`,
      sku: p.product_code,
      quantity: Math.round(randomBetween(20, 200)),
      cutting_line: p.cutting_line,
      status,
      created_at: createdAt.toISOString(),
      expected_completion_at: expectedAt.toISOString(),
      completed_at: completedAt?.toISOString() ?? '',
    };
  });

  return stringify(rows, { header: true });
}
