import { buildLiveTestPlan } from '../../../lib/live-test-plan';

export const dynamic = 'force-dynamic';

export async function GET() {
  const plan = buildLiveTestPlan();
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    plan,
    execution: 'live-test-plan-read-only-no-signing-no-broadcast-no-mutation',
    safety: plan.safety
  }, { headers: { 'cache-control': 'no-store' } });
}
