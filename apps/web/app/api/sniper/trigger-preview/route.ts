import { buildMeridianHubContext, resolveMeridianProjectContextId } from '../../../../lib/meridian-context';
import { getMeridianWalletStore } from '../../../../lib/durable-wallet-store';
import { getLiveActivationStatus } from '../../../../lib/live-activation';
import { buildSniperTriggerPreview, type SniperTriggerPreviewInput } from '../../../../lib/sniper-task-readiness';

export const dynamic = 'force-dynamic';

type Body = SniperTriggerPreviewInput & { projectId?: unknown };

function numberParam(value: string | null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function inputFrom(request: Request, body?: Body | null) {
  const { searchParams } = new URL(request.url);
  return {
    projectId: (typeof body?.projectId === 'string' ? body.projectId : searchParams.get('project'))?.trim() || null,
    preview: {
      source: body?.source ?? (searchParams.get('source') === 'manual' ? 'manual' : undefined),
      mint: (typeof body?.mint === 'string' ? body.mint : searchParams.get('mint'))?.trim() || null,
      connectedSigner: (typeof body?.connectedSigner === 'string' ? body.connectedSigner : searchParams.get('connectedSigner'))?.trim() || null,
      amountSol: typeof body?.amountSol === 'number' ? body.amountSol : numberParam(searchParams.get('amountSol')),
      slippageBps: typeof body?.slippageBps === 'number' ? body.slippageBps : numberParam(searchParams.get('slippageBps')),
      simulationProof: body?.simulationProof
    } satisfies SniperTriggerPreviewInput
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
  const preview = buildSniperTriggerPreview(active?.project ?? null, active?.wallets ?? store.wallets.filter((wallet) => !wallet.archived), getLiveActivationStatus(), input.preview);
  return Response.json({
    status: preview.status,
    observedAt,
    preview
  }, { headers: { 'cache-control': 'no-store' } });
}

export async function GET(request: Request) {
  return responseFor(request);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Body;
  return responseFor(request, body);
}
