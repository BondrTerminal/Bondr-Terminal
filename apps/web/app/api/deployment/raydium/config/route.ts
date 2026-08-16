import { buildMeridianHubContext, resolveMeridianProjectContextId } from '../../../../../lib/meridian-context';
import { getMeridianWalletStore } from '../../../../../lib/durable-wallet-store';
import { buildRaydiumRouteConfig, type RaydiumRouteConfigOverrides } from '../../../../../lib/raydium-route-config';

export const dynamic = 'force-dynamic';

type Body = RaydiumRouteConfigOverrides & {
  projectId?: unknown;
};

function projectIdFrom(request: Request, body?: Body | null) {
  const { searchParams } = new URL(request.url);
  return (typeof body?.projectId === 'string' ? body.projectId : searchParams.get('project'))?.trim() || null;
}

function overridesFrom(request: Request, body?: Body | null): RaydiumRouteConfigOverrides {
  const { searchParams } = new URL(request.url);
  return {
    configId: body?.configId ?? searchParams.get('configId'),
    baseDecimals: body?.baseDecimals ?? Number(searchParams.get('baseDecimals') ?? NaN),
    quoteDecimals: body?.quoteDecimals ?? Number(searchParams.get('quoteDecimals') ?? NaN),
    baseAmountRaw: body?.baseAmountRaw ?? searchParams.get('baseAmountRaw'),
    quoteAmountRaw: body?.quoteAmountRaw ?? searchParams.get('quoteAmountRaw'),
    recentBlockhash: body?.recentBlockhash ?? searchParams.get('recentBlockhash')
  };
}

async function responseFor(request: Request, body?: Body | null) {
  const observedAt = new Date().toISOString();
  const store = await getMeridianWalletStore();
  const projectId = projectIdFrom(request, body);
  if (projectId && !resolveMeridianProjectContextId(projectId, store)) {
    return Response.json({ status: 'error', observedAt, error: 'Unknown Bond.Terminal project or wallet group.', project: projectId }, { status: 404, headers: { 'cache-control': 'no-store' } });
  }
  const context = buildMeridianHubContext(projectId, store);
  const active = context.projects[0] ?? null;
  const result = buildRaydiumRouteConfig(active?.project ?? null, active?.wallets ?? [], overridesFrom(request, body));
  return Response.json({
    status: result.status,
    observedAt,
    projectId: active?.project.id ?? projectId,
    result
  }, { status: result.status === 'ready' ? 200 : 409, headers: { 'cache-control': 'no-store' } });
}

export async function GET(request: Request) {
  return responseFor(request);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Body;
  return responseFor(request, body);
}
