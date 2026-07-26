import { NextResponse } from 'next/server';
import { getMarketMakerStatus } from '../../../../lib/status';

export async function GET() {
  const status = await getMarketMakerStatus();
  return NextResponse.json(status, {
    headers: { 'cache-control': 'no-store' }
  });
}
