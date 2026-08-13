import { gmgnReadiness } from '../../../../lib/gmgn';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    source: 'gmgn-readiness',
    gmgn: gmgnReadiness(),
    liveTradingEnabled: process.env.LIVE_TRADING_ENABLED === 'true',
    secretsExposed: false
  });
}
