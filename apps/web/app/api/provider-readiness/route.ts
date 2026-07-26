import { buildProviderReadiness } from '../../../lib/provider-readiness';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await buildProviderReadiness());
  } catch (error) {
    return Response.json({
      status: 'error',
      observedAt: new Date().toISOString(),
      source: 'provider-readiness',
      error: error instanceof Error ? error.message : 'Provider readiness failed.',
      secretsExposed: false
    }, { status: 500 });
  }
}
