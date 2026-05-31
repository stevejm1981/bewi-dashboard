/**
 * Works Order ingestion endpoint.
 *
 * POST /api/v1/works-orders/ingest
 *
 * Auth: shared secret in X-API-Key header.
 * Body: text/csv (raw) or multipart/form-data with a "file" part.
 *
 * Returns ingestion summary (rowCount, upsertedCount, quarantinedCount).
 */

import { NextRequest, NextResponse } from 'next/server';
import { ingestWorksOrderCsv } from '@/lib/works-orders/ingest-csv';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  const expected = process.env.WORKS_ORDER_INGEST_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  if (apiKey !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let csv: string;
  const contentType = request.headers.get('content-type') ?? '';

  try {
    if (contentType.startsWith('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'Missing file part' }, { status: 400 });
      }
      csv = await (file as File).text();
    } else {
      csv = await request.text();
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Failed to read body: ${e?.message}` }, { status: 400 });
  }

  if (!csv.trim()) {
    return NextResponse.json({ error: 'Empty payload' }, { status: 400 });
  }

  try {
    const sourceIp = request.headers.get('x-forwarded-for') ?? null;
    const result = await ingestWorksOrderCsv(csv, { sourceIp: sourceIp ?? undefined });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
