import { meridianAuthRequiredResponse } from '../../../../../lib/meridian-auth';
import { mutationBlockedResponse, sameOriginAllowed } from '../../../../../lib/mutation-safety';
import { buildRaydiumCpmmCreatePoolTransaction, type RaydiumCpmmCreatePoolInput } from '../../../../../lib/raydium-cpmm-create-pool-adapter';

export const dynamic = 'force-dynamic';

const BUILD_WINDOW_MS = 60_000;
const BUILD_MAX_REQUESTS = 12;
const globalForRaydiumBuild = globalThis as typeof globalThis & {
  __bondrRaydiumBuildRateLimit?: Map<string, { count: number; resetAt: number }>;
};

function clientKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown-client';
}

function rateLimit(request: Request) {
  const now = Date.now();
  const key = clientKey(request);
  const store = globalForRaydiumBuild.__bondrRaydiumBuildRateLimit ??= new Map();
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
    error: 'Raydium LP build rate limit exceeded.',
    execution: 'raydium-build-rate-limited-no-signing-no-broadcast',
    retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000)
  }, { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': String(Math.ceil((current.resetAt - now) / 1000)) } });
}

function inputFrom(request: Request, body?: Partial<RaydiumCpmmCreatePoolInput> | null): RaydiumCpmmCreatePoolInput {
  const { searchParams } = new URL(request.url);
  return {
    creator: body?.creator ?? searchParams.get('creator'),
    baseMint: body?.baseMint ?? searchParams.get('baseMint'),
    quoteMint: body?.quoteMint ?? searchParams.get('quoteMint'),
    baseDecimals: body?.baseDecimals ?? Number(searchParams.get('baseDecimals') ?? NaN),
    quoteDecimals: body?.quoteDecimals ?? Number(searchParams.get('quoteDecimals') ?? NaN),
    baseAmountRaw: body?.baseAmountRaw ?? searchParams.get('baseAmountRaw'),
    quoteAmountRaw: body?.quoteAmountRaw ?? searchParams.get('quoteAmountRaw'),
    configId: body?.configId ?? searchParams.get('configId'),
    poolFeeAccount: body?.poolFeeAccount ?? searchParams.get('poolFeeAccount'),
    recentBlockhash: body?.recentBlockhash ?? searchParams.get('recentBlockhash'),
    openTime: body?.openTime ?? searchParams.get('openTime'),
    includeUnsignedTransaction: body?.includeUnsignedTransaction === true || searchParams.get('includeUnsignedTransaction') === 'true'
  };
}

async function buildResponse(request: Request, body?: Partial<RaydiumCpmmCreatePoolInput> | null) {
  const input = inputFrom(request, body);
  if (input.includeUnsignedTransaction) {
    const authBlocked = await meridianAuthRequiredResponse(request);
    if (authBlocked) return authBlocked;
    const limited = rateLimit(request);
    if (limited) return limited;
    if (request.method !== 'GET') {
      const origin = sameOriginAllowed(request);
      if (!origin.allowed) return mutationBlockedResponse(origin.note);
    }
  }

  const result = buildRaydiumCpmmCreatePoolTransaction(input);
  return Response.json({
    status: result.status,
    observedAt: new Date().toISOString(),
    result
  }, { status: result.status === 'blocked' ? 409 : 200, headers: { 'cache-control': 'no-store' } });
}

export async function GET(request: Request) {
  return buildResponse(request);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Partial<RaydiumCpmmCreatePoolInput>;
  return buildResponse(request, body);
}
