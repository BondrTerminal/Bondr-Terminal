import { buildMeridianHubContext, resolveMeridianProjectContextId } from '../../../../lib/meridian-context';
import { getMeridianWalletStore } from '../../../../lib/durable-wallet-store';
import { getLiveActivationStatus } from '../../../../lib/live-activation';
import { buildTaskQueuePreview, type TaskQueuePreviewInput } from '../../../../lib/sniper-task-readiness';

export const dynamic = 'force-dynamic';

type Body = TaskQueuePreviewInput & { projectId?: unknown };

function numberParam(value: string | null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function schedule(value: unknown): TaskQueuePreviewInput['schedule'] {
  return value === 'manual' || value === 'interval' || value === 'timestamp' ? value : undefined;
}

function inputFrom(request: Request, body?: Body | null) {
  const { searchParams } = new URL(request.url);
  return {
    projectId: (typeof body?.projectId === 'string' ? body.projectId : searchParams.get('project'))?.trim() || null,
    preview: {
      taskName: (typeof body?.taskName === 'string' ? body.taskName : searchParams.get('taskName'))?.trim() || null,
      walletIds: Array.isArray(body?.walletIds) ? body.walletIds.filter((item): item is string => typeof item === 'string') : (searchParams.get('walletIds') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
      schedule: schedule(body?.schedule ?? searchParams.get('schedule')),
      intervalSeconds: typeof body?.intervalSeconds === 'number' ? body.intervalSeconds : numberParam(searchParams.get('intervalSeconds')),
      maxRuns: typeof body?.maxRuns === 'number' ? body.maxRuns : numberParam(searchParams.get('maxRuns')),
      cooldownSeconds: typeof body?.cooldownSeconds === 'number' ? body.cooldownSeconds : numberParam(searchParams.get('cooldownSeconds')),
      riskRuleId: (typeof body?.riskRuleId === 'string' ? body.riskRuleId : searchParams.get('riskRuleId'))?.trim() || null,
      paused: body?.paused !== false
    } satisfies TaskQueuePreviewInput
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
  const preview = buildTaskQueuePreview(active?.project ?? null, active?.wallets ?? store.wallets.filter((wallet) => !wallet.archived), getLiveActivationStatus(), input.preview);
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
