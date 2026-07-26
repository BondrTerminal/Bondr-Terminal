export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const body = await request.text();
  const response = await fetch(`${origin}/api/execution-swap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, cache: 'no-store' });
  const payload = await response.json();
  return Response.json({ router: 'jupiter-build-swap', ...payload }, { status: response.status });
}
