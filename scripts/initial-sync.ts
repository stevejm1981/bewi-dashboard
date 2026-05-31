/**
 * Initial sync script. Run this once after deploying the schema to pull
 * a first snapshot of products, orders, shipments, and stock from Unleashed.
 *
 * Usage:
 *   npm run sync:initial
 *
 * Requires UNLEASHED_API_ID, UNLEASHED_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY to be set in .env.local
 */

import { config } from 'dotenv'; config({ path: '.env.local' });
import { runSync } from '../lib/sync/orchestrator';

async function main() {
  console.log('Starting full initial sync...');
  const started = Date.now();
  const result = await runSync('full', 'manual');
  const duration = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\nCompleted in ${duration}s`);
  for (const [entity, summary] of Object.entries(result.entities)) {
    if ('error' in summary) {
      console.log(`  ${entity}: FAILED - ${summary.error}`);
    } else {
      console.log(`  ${entity}: ${summary.processed} processed, ${summary.upserted} upserted, ${summary.pages} pages`);
    }
  }
}

main().catch(e => {
  console.error('Initial sync failed:', e);
  process.exit(1);
});
