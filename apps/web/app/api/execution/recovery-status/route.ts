import { buildExecutionRecoveryReadiness } from '../../../../lib/execution-recovery-readiness';

export const dynamic = 'force-dynamic';

export async function GET() {
  const readiness = buildExecutionRecoveryReadiness();
  return Response.json({
    status: readiness.status,
    observedAt: new Date().toISOString(),
    readiness
  }, { headers: { 'cache-control': 'no-store' } });
}
