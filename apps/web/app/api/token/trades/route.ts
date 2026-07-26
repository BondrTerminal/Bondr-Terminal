export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const { origin, search } = new URL(request.url);
  const response = await fetch(`${origin}/api/token-transactions${search}`, { cache: 'no-store' });
  const payload = await response.json();
  return Response.json({ contract: 'token-trades-v1', ...payload }, { status: response.status });
}
