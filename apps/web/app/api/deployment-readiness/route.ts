import { buildMeridianHubContext, resolveMeridianProjectContextId } from '../../../lib/meridian-context';
import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { getLiveActivationStatus } from '../../../lib/live-activation';
import { DEPLOYMENT_ROUTE_ADAPTERS, buildDeploymentLaunchReadiness } from '../../../lib/deployment-route-adapters';

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
  const activation = getLiveActivationStatus();
  const readiness = active ? buildDeploymentLaunchReadiness(active.project, active.wallets, activation) : null;

  return Response.json({
    status: 'ok',
    observedAt,
    contract: 'bondr-deployment-readiness-v1',
    projectId: active?.project.id ?? null,
    adapters: DEPLOYMENT_ROUTE_ADAPTERS,
    readiness,
    gates: {
      liveTradingEnabled: activation.liveTradingEnabled,
      signingEnabled: activation.signingEnabled,
      broadcastEnabled: activation.broadcastEnabled,
      fundingBroadcastEnabled: activation.fundingBroadcastEnabled,
      deploymentEnabled: activation.deploymentEnabled
    },
    execution: 'read-only-readiness-no-signing-no-broadcast'
  }, { headers: { 'cache-control': 'no-store' } });
}
