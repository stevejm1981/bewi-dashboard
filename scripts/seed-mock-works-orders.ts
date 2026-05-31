/**
 * Seed mock works orders.
 *
 * The real Works Order App is being built separately. Until it's posting
 * to /api/v1/works-orders/ingest, run this script to populate the cutting
 * line dashboards with plausible in-progress works.
 *
 * Usage:
 *   npm run seed:mock-works-orders -- [count]
 *
 * Defaults to 60 mock works orders distributed across active cutting lines.
 */

import { config } from 'dotenv'; config({ path: '.env.local' });
import { generateMockWorksOrdersCsv } from '../lib/works-orders/mock-generator';
import { ingestWorksOrderCsv } from '../lib/works-orders/ingest-csv';

async function main() {
  const count = Number.parseInt(process.argv[2] ?? '60', 10);
  console.log(`Generating ${count} mock works orders...`);

  const csv = await generateMockWorksOrdersCsv(count);
  const result = await ingestWorksOrderCsv(csv, { sourceIp: 'mock-seed' });

  console.log('Ingest complete:');
  console.log(`  Run ID: ${result.runId}`);
  console.log(`  Rows: ${result.rowCount}`);
  console.log(`  Upserted: ${result.upsertedCount}`);
  console.log(`  Quarantined: ${result.quarantinedCount}`);
  console.log(`  Marked missing: ${result.markedMissingCount}`);
}

main().catch(e => {
  console.error('Seed failed:', e);
  process.exit(1);
});
