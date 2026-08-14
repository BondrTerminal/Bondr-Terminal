import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { buildExecutionTruthMap } from '../../../lib/execution-truth-map';
import { getLiveActivationStatus } from '../../../lib/live-activation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('project')?.trim() || null;
  const store = await getMeridianWalletStore();
  const truthMap = buildExecutionTruthMap({ store, projectId, activation: getLiveActivationStatus() });

  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    truthMap,
    safety: 'Read-only truth map. This endpoint does not build, sign, submit, broadcast, fund, deploy, relay, or schedule execution.',
    execution: 'read-only-execution-truth-map-no-signing-no-broadcast'
  }, { headers: { 'cache-control': 'no-store' } });
}
