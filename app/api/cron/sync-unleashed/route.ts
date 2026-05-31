import { NextRequest, NextResponse } from 'next/server';
import { runSync } from '@/lib/sync/orchestrator';

export const maxDuration = 300; // 5 minutes (Vercel Pro)
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Vercel Cron requests carry an authorization header set to the CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runSync('operational', 'scheduled');
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
