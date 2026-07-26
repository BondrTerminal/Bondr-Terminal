import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    service: 'market-maker-web',
    liveTradingEnabled: process.env.LIVE_TRADING_ENABLED === 'true',
    execution: process.env.LIVE_TRADING_ENABLED === 'true' ? 'live-gated-browser-wallet' : 'live-disabled'
  });
}
