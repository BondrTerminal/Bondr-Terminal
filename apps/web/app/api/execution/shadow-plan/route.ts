import { buildMeridianHubContext, resolveMeridianProjectContextId } from '../../../../lib/meridian-context';
import { getMeridianWalletStore } from '../../../../lib/durable-wallet-store';
import { getLiveActivationStatus } from '../../../../lib/live-activation';
import { buildShadowExecutionPacket, type ShadowPlanInput } from '../../../../lib/execution-shadow-plan';

export const dynamic = 'force-dynamic';

type Body = ShadowPlanInput & {
  projectId?: unknown;
};

function inputFrom(request: Request, body?: Body | null) {
  const { searchParams } = new URL(request.url);
  return {
    projectId: (typeof body?.projectId === 'string' ? body.projectId : searchParams.get('project'))?.trim() || null,
    mintPublicKey: (typeof body?.mintPublicKey === 'string' ? body.mintPublicKey : searchParams.get('mint'))?.trim() || null,
    connectedSigner: (typeof body?.connectedSigner === 'string' ? body.connectedSigner : searchParams.get('connectedSigner'))?.trim() || null,
    signedTransactions: body?.signedTransactions,
    expectedSigners: body?.expectedSigners,
    tipLamports: body?.tipLamports ?? searchParams.get('tipLamports'),
    simulationProof: body?.simulationProof ?? (searchParams.get('simulationProof') === 'true' ? { source: 'query-param-shadow-proof' } : null),
    approvalId: body?.approvalId ?? searchParams.get('approvalId'),
    persistAudit: body?.persistAudit === true || searchParams.get('persistAudit') === 'true'
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
  if (!active) {
    return Response.json({
      status: 'blocked',
      observedAt,
      contract: 'bondr-shadow-execution-packet-v1',
      blockers: ['project-required'],
      execution: 'shadow-plan-only-no-signing-no-broadcast'
    }, { headers: { 'cache-control': 'no-store' } });
  }

  const packet = await buildShadowExecutionPacket(active.project, active.wallets, getLiveActivationStatus(), input);
  return Response.json({
    status: packet.status,
    observedAt,
    projectId: active.project.id,
    packet
  }, { status: packet.status === 'shadow-ready' ? 200 : 409, headers: { 'cache-control': 'no-store' } });
}

export async function GET(request: Request) {
  return responseFor(request);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Body;
  return responseFor(request, body);
}
