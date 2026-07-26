import { buildProviderReadiness } from '../../../lib/provider-readiness';

export const dynamic = 'force-dynamic';

export async function GET() {
  const readiness = await buildProviderReadiness();
  return Response.json({
    status: readiness.status,
    observedAt: readiness.observedAt,
    sources: readiness.sources,
    blockingForLive: readiness.blockingForLive,
    optionalProviderGaps: readiness.optionalProviderGaps,
    providerReadinessRoute: '/api/provider-readiness',
    secretsExposed: false,
    execution: readiness.execution
  });
}
