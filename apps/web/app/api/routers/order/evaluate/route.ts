export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const payload = await request.json().catch(() => ({}));
  const response = await fetch(`${origin}/api/terminal-order-engine`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, action: 'evaluate' }), cache: 'no-store' });
  const upstream = await response.json();
  return Response.json({ router: 'order-evaluate', ...upstream }, { status: response.status });
}
