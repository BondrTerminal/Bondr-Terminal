export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet') ?? '';
  const group = searchParams.get('group') ?? '';
  const limit = searchParams.get('limit') ?? '100';
  const qs = wallet ? `wallet=${encodeURIComponent(wallet)}&limit=${encodeURIComponent(limit)}` : `group=${encodeURIComponent(group)}&limit=${encodeURIComponent(limit)}`;
  const response = await fetch(`${origin}/api/wallet-funding-index?${qs}`, { cache: 'no-store' });
  const payload = await response.json();
  return Response.json({ status: response.ok ? 'ok' : 'error', reader: 'wallet-history', rows: payload.rows ?? [], walletCount: payload.walletCount ?? null, upstreamStatus: payload.status ?? null }, { status: response.ok ? 200 : response.status });
}
