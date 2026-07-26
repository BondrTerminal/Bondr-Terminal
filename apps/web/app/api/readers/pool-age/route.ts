export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const mint = searchParams.get('mint') ?? '';
  const response = await fetch(`${origin}/api/token-pool-index?mint=${encodeURIComponent(mint)}`, { cache: 'no-store' });
  const payload = await response.json();
  return Response.json({ status: response.ok ? 'ok' : 'error', reader: 'pool-age', mint, poolAgeSource: payload.summary?.poolAgeSource ?? null, firstSeenAt: payload.summary?.firstSeenAt ?? payload.summary?.pairCreatedAt ?? null, bitquery: payload.sources?.bitquery ?? null, dexscreener: payload.sources?.dexscreener ?? null }, { status: response.ok ? 200 : response.status });
}
