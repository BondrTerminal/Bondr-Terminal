import { buildMeridianHubContext, resolveMeridianProjectContextId } from '../../../../lib/meridian-context';
import { getMeridianWalletStore } from '../../../../lib/durable-wallet-store';
import { buildWalletSigningReadiness } from '../../../../lib/wallet-signing-readiness';

export const dynamic = 'force-dynamic';

type Body = {
  projectId?: unknown;
  signedWalletIds?: unknown;
  blockhashExpiresAt?: unknown;
};

function inputFrom(request: Request, body?: Body | null) {
  const { searchParams } = new URL(request.url);
  const signedParam = searchParams.get('signedWalletIds') ?? '';
  return {
    projectId: (typeof body?.projectId === 'string' ? body.projectId : searchParams.get('project'))?.trim() || null,
    signedWalletIds: Array.isArray(body?.signedWalletIds)
      ? body.signedWalletIds.filter((item): item is string => typeof item === 'string')
      : signedParam.split(',').map((item) => item.trim()).filter(Boolean),
    blockhashExpiresAt: (typeof body?.blockhashExpiresAt === 'string' ? body.blockhashExpiresAt : searchParams.get('blockhashExpiresAt'))?.trim() || null
  };
}

async function responseFor(request: Request, body?: Body | null) {
  const observedAt = new Date().toISOString();
  const input = inputFrom(request, body);
  const store = await getMeridianWalletStore();
  if (input.projectId && !resolveMeridianProjectContextId(input.projectId, store)) {
    return Response.json({ status: 'error', observedAt, error: 'Unknown Bond.Terminal project or wallet group.', project: input.projectId }, { status: 404 });
  }
  const context = buildMeridianHubContext(input.projectId, store);
  const active = context.projects[0] ?? null;
  if (!active) return Response.json({ status: 'blocked', observedAt, blockers: ['project-required'], execution: 'signing-session-readiness-only-no-signing' }, { headers: { 'cache-control': 'no-store' } });
  const readiness = buildWalletSigningReadiness(active.project, active.wallets, input);
  return Response.json({
    status: readiness.bundleSession.status,
    observedAt,
    projectId: active.project.id,
    readiness,
    execution: 'signing-session-readiness-only-no-signing'
  }, { headers: { 'cache-control': 'no-store' } });
}

export async function GET(request: Request) {
  return responseFor(request);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Body;
  return responseFor(request, body);
}
