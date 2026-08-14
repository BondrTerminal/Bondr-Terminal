import { buildMeridianHubContext, resolveMeridianProjectContextId } from '../../../../lib/meridian-context';
import { getMeridianWalletStore } from '../../../../lib/durable-wallet-store';
import { getLiveActivationStatus } from '../../../../lib/live-activation';
import { buildSniperExecutionReadiness } from '../../../../lib/sniper-task-readiness';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('project')?.trim() || null;
  const observedAt = new Date().toISOString();
  const store = await getMeridianWalletStore();

  if (projectId && !resolveMeridianProjectContextId(projectId, store)) {
    return Response.json({ status: 'error', observedAt, error: 'Unknown Bond.Terminal project or wallet group.', project: projectId }, { status: 404 });
  }

  const context = buildMeridianHubContext(projectId, store);
  const active = context.projects[0] ?? null;
  const readiness = buildSniperExecutionReadiness(active?.project ?? null, active?.wallets ?? store.wallets.filter((wallet) => !wallet.archived), getLiveActivationStatus());

  return Response.json({
    status: readiness.status,
    observedAt,
    readiness
  }, { headers: { 'cache-control': 'no-store' } });
}
