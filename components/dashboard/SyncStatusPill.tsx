'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface RecentRun {
  entity: string;
  trigger: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_upserted: number | null;
}

export function SyncStatusPill() {
  const router = useRouter();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [loading, setLoading] = useState(false);

  // Poll for sync changes every 30 seconds
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const fetchLastSync = async () => {
      const { data } = await supabase
        .from('sync_runs')
        .select('completed_at, started_at')
        .eq('entity', 'sales_orders')
        .eq('status', 'success')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const ts = data?.completed_at ?? data?.started_at ?? null;
      setLastSync(prev => {
        if (ts && ts !== prev) {
          // New sync detected → refresh dashboard data silently
          if (prev !== null) router.refresh();
          return ts;
        }
        return prev;
      });
    };

    fetchLastSync();
    const id = setInterval(fetchLastSync, 30_000);
    return () => clearInterval(id);
  }, [router]);

  async function loadRecent() {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from('sync_runs')
      .select('entity, trigger, status, started_at, completed_at, records_upserted')
      .order('started_at', { ascending: false })
      .limit(15);
    setRecent((data ?? []) as RecentRun[]);
    setLoading(false);
  }

  function toggle() {
    if (!open) loadRecent();
    setOpen(o => !o);
  }

  const stale = lastSync && Date.now() - new Date(lastSync).getTime() > 30 * 60 * 1000;
  const label = lastSync
    ? `Synced ${formatDistanceToNow(new Date(lastSync))} ago`
    : 'Not yet synced';

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="flex items-center gap-2 text-xs text-ink-muted tabular hover:text-ink transition-colors"
      >
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            !lastSync ? 'bg-line-strong'
              : stale ? 'bg-accent-warm'
                : 'bg-accent-ok'
          }`}
        />
        {label}
        <span className="text-ink-subtle">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-3 w-96 bg-paper-card border divider shadow-lg z-50">
          <div className="px-5 py-4 border-b divider flex items-baseline justify-between">
            <div>
              <div className="eyebrow">Sync activity</div>
              <div className="text-xs text-ink-muted mt-1">Last 15 runs</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-ink-subtle hover:text-ink"
            >
              Close
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && <div className="px-5 py-4 text-xs text-ink-muted">Loading…</div>}
            {!loading && recent.length === 0 && (
              <div className="px-5 py-4 text-xs text-ink-muted">No sync activity yet.</div>
            )}
            {!loading && recent.map((run, idx) => (
              <div
                key={`${run.started_at}-${idx}`}
                className="px-5 py-3 border-b divider last:border-b-0 hover:bg-paper-sunk"
              >
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-medium">{prettyEntity(run.entity)}</div>
                  <div className="text-xs text-ink-subtle tabular">
                    {formatDistanceToNow(new Date(run.started_at))} ago
                  </div>
                </div>
                <div className="flex items-baseline gap-3 mt-1 text-xs text-ink-muted tabular">
                  <span className={`inline-flex items-center gap-1 ${statusColor(run.status)}`}>
                    <span className={`inline-block w-1 h-1 rounded-full ${statusDot(run.status)}`} />
                    {run.status}
                  </span>
                  <span>·</span>
                  <span>{prettyTrigger(run.trigger)}</span>
                  {run.records_upserted != null && (
                    <>
                      <span>·</span>
                      <span>{run.records_upserted} {run.records_upserted === 1 ? 'record' : 'records'}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function prettyEntity(e: string): string {
  switch (e) {
    case 'sales_orders': return 'Sales Orders';
    case 'sales_shipments': return 'Sales Shipments';
    case 'stock_on_hand': return 'Stock on Hand';
    case 'products': return 'Products';
    case 'customers': return 'Customers';
    default: return e;
  }
}

function prettyTrigger(t: string): string {
  switch (t) {
    case 'scheduled': return 'Auto';
    case 'manual': return 'Manual';
    case 'reconciliation': return 'Reconciliation';
    default: return t;
  }
}

function statusColor(s: string): string {
  if (s === 'success') return 'text-accent-ok';
  if (s === 'running') return 'text-ink-muted';
  if (s === 'failed') return 'text-accent-alert';
  return 'text-ink-muted';
}

function statusDot(s: string): string {
  if (s === 'success') return 'bg-accent-ok';
  if (s === 'running') return 'bg-ink-muted animate-pulse';
  if (s === 'failed') return 'bg-accent-alert';
  return 'bg-ink-subtle';
}
