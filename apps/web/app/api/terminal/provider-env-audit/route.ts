import { buildProviderReadiness } from '../../../../lib/provider-readiness';
import { paperLedgerStorageMetadata } from '../../../../lib/paper-ledger';

export const dynamic = 'force-dynamic';

type AuditStatus = 'configured' | 'missing' | 'degraded' | 'rate-limited' | 'provider-ready';

function auditStatus(provider: { status?: string; configured?: boolean | null; error?: string | null; rateLimitOrError?: string | null }): AuditStatus {
  const status = provider.status ?? '';
  const error = String(provider.error ?? provider.rateLimitOrError ?? '').toLowerCase();
  if (status.includes('rate') || error.includes('429') || error.includes('rate')) return 'rate-limited';
  if (status === 'ok') return provider.configured === false ? 'provider-ready' : 'configured';
  if (status === 'optional-not-configured' || provider.configured === false) return 'missing';
  if (status === 'public-fallback') return 'degraded';
  return 'degraded';
}

export async function GET() {
  const readiness = await buildProviderReadiness();
  const providers = Object.fromEntries(Object.entries(readiness.sources).map(([name, raw]) => {
    const item = raw as { status?: string; configured?: boolean | null; note?: string | null; error?: string | null; rateLimitOrError?: string | null; latencyMs?: number | null };
    return [name, {
      status: auditStatus(item),
      providerStatus: item.status ?? 'unknown',
      configured: typeof item.configured === 'boolean' ? item.configured : null,
      latencyMs: typeof item.latencyMs === 'number' ? item.latencyMs : null,
      note: item.note ?? null
    }];
  }));
  const paperLedger = paperLedgerStorageMetadata();
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    source: 'terminal-provider-env-audit',
    allowedStatuses: ['configured', 'missing', 'degraded', 'rate-limited', 'provider-ready'],
    providers,
    paperLedger,
    blockingForLive: readiness.blockingForLive,
    optionalProviderGaps: readiness.optionalProviderGaps,
    secretsExposed: false,
    execution: 'read-only-env-audit'
  });
}
