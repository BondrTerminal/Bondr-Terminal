import { normalizePumpTrade, pumpfunFetch } from '../../../../lib/indexers/pumpfun';
export const dynamic = 'force-dynamic';
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim() ?? '';
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '50'), 1), 100);
  if (!ADDRESS_RE.test(mint)) return Response.json({ error: 'Missing or invalid mint.' }, { status: 400 });
  const result = await pumpfunFetch<Array<Record<string, unknown>>>(`/trades/all/${mint}`, { query: { limit, offset: 0, minimumSize: 0 }, authRequired: false });
  const trades = (result.data ?? []).map(normalizePumpTrade).filter((row) => row.wallet || row.txHash);
  return Response.json({ status: result.status, observedAt: new Date().toISOString(), mint, source: result.source, endpoint: result.endpoint, authConfigured: result.authConfigured, note: result.note, trades, execution: 'pumpfun-trades-read' });
}
