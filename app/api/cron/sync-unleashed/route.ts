import { NextRequest, NextResponse } from 'next/server';
import { runSync } from '@/lib/sync/orchestrator';

export const maxDuration = 480; // 8 minutes (Vercel Pro)
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Vercel Cron requests carry an authorization header set to the CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Mode from the query string. The nightly cron passes ?mode=full to refresh
  // products and customers; the 10-minute cron omits it and runs operational.
  const mode = request.nextUrl.searchParams.get('mode') === 'full' ? 'full' : 'operational';

  try {
    const result = await runSync(mode, 'scheduled');
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
