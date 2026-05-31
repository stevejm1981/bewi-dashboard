import { getSupabaseServerClient } from '@/lib/supabase/server';
import { formatDistanceToNow } from 'date-fns';

export async function SyncStatusPill() {
  const supabase = getSupabaseServerClient();

  const { data: syncStatus } = await supabase
    .from('v_sync_status')
    .select('entity, last_success_at, last_status');

  const orders = syncStatus?.find(s => s.entity === 'sales_orders');
  const lastSync = orders?.last_success_at;

  const label = lastSync
    ? `Synced ${formatDistanceToNow(new Date(lastSync))} ago`
    : 'Not yet synced';

  const stale = lastSync && Date.now() - new Date(lastSync).getTime() > 30 * 60 * 1000;

  return (
    <div className="flex items-center gap-2 text-xs text-ink-muted tabular">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          !lastSync ? 'bg-line-strong'
          : stale ? 'bg-accent-warm'
          : 'bg-accent-ok'
        }`}
      />
      {label}
    </div>
  );
}
