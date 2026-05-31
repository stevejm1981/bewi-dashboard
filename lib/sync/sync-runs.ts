/**
 * Sync run lifecycle helpers. Every sync logs a row in sync_runs so the
 * dashboard can show last-success-per-entity.
 */

import { getSupabaseServiceClient } from '@/lib/supabase/server';

export async function startSyncRun(
  entity: string,
  trigger: 'scheduled' | 'manual' | 'reconciliation',
  triggeredBy?: string,
): Promise<string> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('sync_runs')
    .insert({
      entity,
      trigger,
      triggered_by_user: triggeredBy ?? null,
      status: 'running',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Failed to start sync run: ${error?.message}`);
  return data.id;
}

export async function completeSyncRun(
  id: string,
  metrics: { recordsProcessed?: number; recordsUpserted?: number; pagesProcessed?: number },
) {
  const supabase = getSupabaseServiceClient();
  await supabase
    .from('sync_runs')
    .update({
      completed_at: new Date().toISOString(),
      status: 'success',
      records_processed: metrics.recordsProcessed,
      records_upserted: metrics.recordsUpserted,
      pages_processed: metrics.pagesProcessed,
    })
    .eq('id', id);
}

export async function failSyncRun(id: string, error: string) {
  const supabase = getSupabaseServiceClient();
  await supabase
    .from('sync_runs')
    .update({
      completed_at: new Date().toISOString(),
      status: 'failed',
      error,
    })
    .eq('id', id);
}
