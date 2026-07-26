import { pumpfunFetch } from '../../../../lib/indexers/pumpfun';
export const dynamic = 'force-dynamic';
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export async function GET(request: Request) {
  const mint = new URL(request.url).searchParams.get('mint')?.trim() ?? '';
  if (!ADDRESS_RE.test(mint)) return Response.json({ error: 'Missing or invalid mint.' }, { status: 400 });
  const result = await pumpfunFetch<Record<string, unknown>>(`/coins/${mint}`, { query: { sync: true } });
  return Response.json({ status: result.status, observedAt: new Date().toISOString(), mint, source: result.source, endpoint: result.endpoint, authConfigured: result.authConfigured, note: result.note, coin: result.data, creator: result.data ? String(result.data.creator ?? result.data.user ?? result.data.user_id ?? '') || null : null, migration: result.data ? { complete: Boolean(result.data.complete), raydiumPool: result.data.raydium_pool ?? null, marketCap: result.data.usd_market_cap ?? result.data.market_cap ?? null, virtualSolReserves: result.data.virtual_sol_reserves ?? null } : null });
}
