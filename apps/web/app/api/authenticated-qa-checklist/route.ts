import { buildAuthenticatedQaChecklist } from '../../../lib/authenticated-qa-checklist';
import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { meridianRequestAuthenticated } from '../../../lib/meridian-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const auth = await meridianRequestAuthenticated(request);
  const store = await getMeridianWalletStore();
  const checklist = buildAuthenticatedQaChecklist({
    auth,
    store,
    projectId: searchParams.get('project')?.trim() || null
  });

  return Response.json({
    status: checklist.status === 'ready' ? 'ok' : 'blocked',
    observedAt: new Date().toISOString(),
    checklist,
    execution: 'authenticated-qa-read-only-no-mutation',
    safety: checklist.safety
  }, { status: checklist.status === 'ready' ? 200 : 401, headers: { 'cache-control': 'no-store' } });
}
