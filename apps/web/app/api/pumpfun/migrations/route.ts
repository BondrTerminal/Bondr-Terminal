import { pumpfunFetch } from '../../../../lib/indexers/pumpfun';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '50'), 1), 100);
  const result = await pumpfunFetch<Array<Record<string, unknown>>>('/coins/graduated', { base: 'advanced', query: { limit, offset: 0 }, authRequired: true });
  return Response.json({ status: result.status, observedAt: new Date().toISOString(), source: result.source, endpoint: result.endpoint, authConfigured: result.authConfigured, note: result.note, migrations: result.data ?? [], execution: 'pumpfun-migrations-read' });
}
