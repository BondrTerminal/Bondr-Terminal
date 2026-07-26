export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const mint = searchParams.get('mint') ?? '';
  const limit = searchParams.get('limit') ?? '100';
  const response = await fetch(`${origin}/api/token-stats?mint=${encodeURIComponent(mint)}&holderListLimit=${encodeURIComponent(limit)}`, { cache: 'no-store' });
  const payload = await response.json();
  return Response.json({ status: response.ok ? 'ok' : 'error', reader: 'token-accounts', mint, holders: payload.holders ?? null, source: payload.holders?.source ?? payload.source ?? null, upstreamStatus: payload.status ?? null }, { status: response.ok ? 200 : response.status });
}
