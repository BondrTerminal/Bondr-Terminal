import { buildMeridianHubContext, resolveMeridianProjectContextId } from '../../../../../lib/meridian-context';
import { getMeridianWalletStore } from '../../../../../lib/durable-wallet-store';
import { getLiveActivationStatus } from '../../../../../lib/live-activation';
import { meridianAuthRequiredResponse } from '../../../../../lib/meridian-auth';
import { mutationBlockedResponse, sameOriginAllowed } from '../../../../../lib/mutation-safety';
import { buildPumpPortalCreateTransaction } from '../../../../../lib/pumpportal-deploy-readiness';

export const dynamic = 'force-dynamic';

const BUILD_WINDOW_MS = 60_000;
const BUILD_MAX_REQUESTS = 20;
const globalForBuildCreate = globalThis as typeof globalThis & {
  __bondrPumpBuildRateLimit?: Map<string, { count: number; resetAt: number }>;
};

type Body = {
  projectId?: unknown;
  mintPublicKey?: unknown;
  connectedSigner?: unknown;
  confirmBuild?: unknown;
  includeUnsignedTransaction?: unknown;
  createIntent?: unknown;
};

function inputFrom(request: Request, body?: Body | null) {
  const { searchParams } = new URL(request.url);
  return {
    projectId: (typeof body?.projectId === 'string' ? body.projectId : searchParams.get('project'))?.trim() || null,
    mintPublicKey: (typeof body?.mintPublicKey === 'string' ? body.mintPublicKey : searchParams.get('mint'))?.trim() || null,
    connectedSigner: (typeof body?.connectedSigner === 'string' ? body.connectedSigner : searchParams.get('connectedSigner'))?.trim() || null,
    confirmBuild: body?.confirmBuild === true || searchParams.get('confirmBuild') === 'true',
    includeUnsignedTransaction: body?.includeUnsignedTransaction === true || searchParams.get('includeUnsignedTransaction') === 'true',
    createIntent: body?.createIntent === true || searchParams.get('createIntent') === 'true'
  };
}

function sensitiveBuildRequested(input: ReturnType<typeof inputFrom>) {
  return input.confirmBuild || input.includeUnsignedTransaction || input.createIntent;
}

function clientKey(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown-client';
}

function rateLimitSensitiveBuild(request: Request) {
  const now = Date.now();
  const key = clientKey(request);
  const store = globalForBuildCreate.__bondrPumpBuildRateLimit ??= new Map();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + BUILD_WINDOW_MS });
    return null;
  }
  current.count += 1;
  if (current.count <= BUILD_MAX_REQUESTS) return null;
  return Response.json({
    status: 'blocked',
    observedAt: new Date().toISOString(),
    error: 'Pump.fun build-create rate limit exceeded.',
    execution: 'build-create-rate-limited-no-provider-call-no-signing-no-broadcast',
    retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000)
  }, { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': String(Math.ceil((current.resetAt - now) / 1000)) } });
}

async function buildResponse(request: Request, body?: Body | null) {
  const observedAt = new Date().toISOString();
  const input = inputFrom(request, body);
  if (sensitiveBuildRequested(input)) {
    const authBlocked = await meridianAuthRequiredResponse(request);
    if (authBlocked) return authBlocked;
    const limited = rateLimitSensitiveBuild(request);
    if (limited) return limited;
    if (request.method !== 'GET') {
      const origin = sameOriginAllowed(request);
      if (!origin.allowed) return mutationBlockedResponse(origin.note);
    }
  }
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
