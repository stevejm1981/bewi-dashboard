/**
 * Manual sync endpoint - triggered by the "Refresh" button on the dashboard.
 *
 * Safeguards:
 *  - 60-second cooldown per user
 *  - Concurrency check: if a sync is already running, return early
 *  - Audit log: every manual refresh logged via sync_runs with trigger='manual'
 *
 * Defaults to operational mode (orders, shipments, stock - skips products
 * and customers, for a fast refresh). Pass { "mode": "full" } in the body
 * to run a full sync that also refreshes products and customers - needed
 * when new SKUs have been created in Unleashed since the last full sync.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';
import { runSync } from '@/lib/sync/orchestrator';

export const maxDuration = 480;
export const dynamic = 'force-dynamic';

const COOLDOWN_SECONDS = 60;

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Read requested mode (defaults to operational). Body may be empty.
  let mode: 'operational' | 'full' = 'operational';
  try {
    const body = await request.json();
    if (body?.mode === 'full') mode = 'full';
  } catch {
    // no body / not JSON - keep default operational
  }

  const service = getSupabaseServiceClient();

  // Cooldown check: has this user triggered a manual sync within the last 60s?
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_SECONDS * 1000).toISOString();
  const { data: recent } = await service
    .from('sync_runs')
    .select('id, started_at')
    .eq('trigger', 'manual')
    .eq('triggered_by_user', user.id)
    .gte('started_at', cooldownCutoff)
    .limit(1);

  if (recent && recent.length > 0) {
    const lastStarted = new Date(recent[0].started_at).getTime();
    const remainingSec = COOLDOWN_SECONDS - Math.floor((Date.now() - lastStarted) / 1000);
    return NextResponse.json(
      {
        error: 'Cooldown active',
        cooldownRemainingSeconds: Math.max(remainingSec, 0),
      },
      { status: 429 },
    );
  }

  // Concurrency check: is any sync currently running?
  const { data: running } = await service
    .from('sync_runs')
    .select('id, entity')
    .eq('status', 'running')
    .limit(1);

  if (running && running.length > 0) {
    return NextResponse.json(
      { error: 'A sync is already in progress', running: running[0] },
      { status: 409 },
    );
  }

  try {
    const result = await runSync(mode, 'manual', user.id);

    await service.from('audit_events').insert({
      entity_type: 'sync',
      event_type: mode === 'full' ? 'manual_full_sync' : 'manual_refresh',
      actor_user_id: user.id,
      payload: { mode, durationMs: result.durationMs, entities: result.entities },
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
