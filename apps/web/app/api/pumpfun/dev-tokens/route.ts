import { pumpfunFetch } from '../../../../lib/indexers/pumpfun';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId')?.trim() || searchParams.get('creator')?.trim() || '';
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '50'), 1), 100);
  if (!userId) return Response.json({ status: 'missing-creator', source: 'pumpfun', authConfigured: Boolean(process.env.PUMPFUN_JWT || process.env.PUMPFUN_API_TOKEN), note: 'Pass creator/userId from Pump.fun coin metadata to read creator token history.', tokens: [] });
  const result = await pumpfunFetch<Array<Record<string, unknown>>>(`/coins/user-created-coins/${encodeURIComponent(userId)}`, { query: { limit, offset: 0 }, authRequired: true });
  return Response.json({ status: result.status, observedAt: new Date().toISOString(), creator: userId, source: result.source, endpoint: result.endpoint, authConfigured: result.authConfigured, note: result.note, tokens: result.data ?? [], execution: 'pumpfun-dev-tokens-read' });
}
