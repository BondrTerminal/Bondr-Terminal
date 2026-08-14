import { buildMeridianHubContext, resolveMeridianProjectContextId } from '../../../../../lib/meridian-context';
import { getMeridianWalletStore } from '../../../../../lib/durable-wallet-store';
import { getLiveActivationStatus } from '../../../../../lib/live-activation';
import { buildPumpPortalCreateTransaction } from '../../../../../lib/pumpportal-deploy-readiness';

export const dynamic = 'force-dynamic';

type Body = {
  projectId?: unknown;
  mintPublicKey?: unknown;
  connectedSigner?: unknown;
  confirmBuild?: unknown;
};

function inputFrom(request: Request, body?: Body | null) {
  const { searchParams } = new URL(request.url);
  return {
    projectId: (typeof body?.projectId === 'string' ? body.projectId : searchParams.get('project'))?.trim() || null,
    mintPublicKey: (typeof body?.mintPublicKey === 'string' ? body.mintPublicKey : searchParams.get('mint'))?.trim() || null,
    connectedSigner: (typeof body?.connectedSigner === 'string' ? body.connectedSigner : searchParams.get('connectedSigner'))?.trim() || null,
    confirmBuild: body?.confirmBuild === true || searchParams.get('confirmBuild') === 'true'
  };
}

async function buildResponse(request: Request, body?: Body | null) {
  const observedAt = new Date().toISOString();
  const input = inputFrom(request, body);
  const store = await getMeridianWalletStore();

  if (input.projectId && !resolveMeridianProjectContextId(input.projectId, store)) {
    return Response.json({ status: 'error', observedAt, error: 'Unknown Bond.Terminal project or wallet group.', project: input.projectId }, { status: 404 });
  }

  const context = buildMeridianHubContext(input.projectId, store);
  const active = context.projects[0] ?? null;
  if (!active) {
    return Response.json({
      status: 'blocked',
      observedAt,
      contract: 'bondr-pumpportal-build-create-v1',
      blockers: ['project-required'],
      execution: 'blocked-no-provider-call'
    }, { headers: { 'cache-control': 'no-store' } });
  }

  const result = await buildPumpPortalCreateTransaction(active.project, active.wallets, getLiveActivationStatus(), input);
  return Response.json({
    status: result.status,
    observedAt,
    projectId: active.project.id,
    result
  }, { status: result.status === 'built' ? 200 : 409, headers: { 'cache-control': 'no-store' } });
}

export async function GET(request: Request) {
  return buildResponse(request);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Body;
  return buildResponse(request, body);
}
