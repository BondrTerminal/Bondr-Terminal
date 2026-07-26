import { NextResponse } from 'next/server';
import { getPaperSessionReport } from '../../../../lib/status';

export async function GET() {
  const report = await getPaperSessionReport();
  return NextResponse.json(report, {
    headers: { 'cache-control': 'no-store' }
  });
}
