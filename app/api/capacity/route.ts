/**
 * POST /api/capacity
 * Body: { cutting_line: string, daily_capacity_m3: number }
 *
 * Sets the daily capacity for a cutting line. Any logged-in dashboard user
 * can change it; every change is written to cutting_line_capacity_history
 * with who and when.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { cutting_line?: string; daily_capacity_m3?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body is not valid JSON' }, { status: 400 });
  }

  const line = (body.cutting_line ?? '').trim().toUpperCase();
  const value = Number(body.daily_capacity_m3);
  if (!line) return NextResponse.json({ error: 'cutting_line is required' }, { status: 400 });
  if (!isFinite(value) || value < 0) return NextResponse.json({ error: 'daily_capacity_m3 must be a number >= 0' }, { status: 400 });

  const service = getSupabaseServiceClient();
  const who = user.email ?? user.id;

  const { data: existing } = await service
    .from('cutting_line_capacity')
    .select('daily_capacity_m3')
    .eq('cutting_line', line)
    .maybeSingle();

  const { error: upsertError } = await service
    .from('cutting_line_capacity')
    .upsert(
      { cutting_line: line, daily_capacity_m3: value, updated_at: new Date().toISOString(), updated_by: who },
      { onConflict: 'cutting_line' },
    );
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  await service.from('cutting_line_capacity_history').insert({
    cutting_line: line,
    old_value: existing?.daily_capacity_m3 ?? null,
    new_value: value,
    changed_by: who,
  });

  return NextResponse.json({ ok: true, cutting_line: line, daily_capacity_m3: value, changed_by: who });
}
