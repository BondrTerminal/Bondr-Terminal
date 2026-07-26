import { NextResponse } from 'next/server';
import { getOperatorFeed } from '../../../../lib/status';

export async function GET() {
  const feed = await getOperatorFeed();
  return NextResponse.json(feed, {
    headers: { 'cache-control': 'no-store' }
  });
}
