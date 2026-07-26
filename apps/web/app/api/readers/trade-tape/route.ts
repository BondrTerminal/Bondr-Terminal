export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const mint = searchParams.get('mint') ?? '';
  const limit = searchParams.get('limit') ?? '100';
  const response = await fetch(`${origin}/api/token-transactions?mint=${encodeURIComponent(mint)}&limit=${encodeURIComponent(limit)}`, { cache: 'no-store' });
  const payload = await response.json();
  return Response.json({ status: response.ok ? 'ok' : 'error', reader: 'trade-tape', mint, trades: payload.trades ?? [], summary: payload.summary ?? null, sources: payload.sources ?? null, fallbackSource: payload.fallbackSource ?? null }, { status: response.ok ? 200 : response.status });
}
