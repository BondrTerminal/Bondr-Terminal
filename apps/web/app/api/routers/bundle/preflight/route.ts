export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const payload = await request.json().catch(() => ({}));
  const response = await fetch(`${origin}/api/bundle-sequencer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, mode: 'preflight' }), cache: 'no-store' });
  const upstream = await response.json();
  return Response.json({ router: 'bundle-preflight', ...upstream }, { status: response.status });
}
