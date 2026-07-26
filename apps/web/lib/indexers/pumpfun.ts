const FRONTEND_BASE = process.env.PUMPFUN_FRONTEND_API_URL?.trim() || 'https://frontend-api-v3.pump.fun';
const ADVANCED_BASE = process.env.PUMPFUN_ADVANCED_API_URL?.trim() || 'https://advanced-api-v2.pump.fun';
const TIMEOUT_MS = 7_000;

export type PumpfunResult<T> = {
  status: 'ok' | 'not-configured' | 'unavailable' | 'empty';
  source: 'pumpfun';
  endpoint: string;
  authConfigured: boolean;
  note: string | null;
  data: T | null;
};

type FetchOptions = { base?: 'frontend' | 'advanced'; authRequired?: boolean; query?: Record<string, string | number | boolean | null | undefined> };

function token() {
  return process.env.PUMPFUN_JWT?.trim() || process.env.PUMPFUN_API_TOKEN?.trim() || null;
}

function buildUrl(path: string, options: FetchOptions = {}) {
  const base = options.base === 'advanced' ? ADVANCED_BASE : FRONTEND_BASE;
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function pumpfunFetch<T>(path: string, options: FetchOptions = {}): Promise<PumpfunResult<T>> {
  const jwt = token();
  const endpoint = buildUrl(path, options);
  if (options.authRequired && !jwt) return { status: 'not-configured', source: 'pumpfun', endpoint, authConfigured: false, note: 'PUMPFUN_JWT not configured; this Pump.fun endpoint usually requires Bearer auth.', data: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        origin: 'https://pump.fun',
        ...(jwt ? { authorization: `Bearer ${jwt}` } : {})
      }
    });
    if (!response.ok) return { status: response.status === 401 || response.status === 403 ? 'not-configured' : response.status === 404 ? 'empty' : 'unavailable', source: 'pumpfun', endpoint, authConfigured: Boolean(jwt), note: `Pump.fun ${response.status} ${response.statusText}`, data: null };
    const data = await response.json() as T;
    const empty = Array.isArray(data) && data.length === 0;
    return { status: empty ? 'empty' : 'ok', source: 'pumpfun', endpoint, authConfigured: Boolean(jwt), note: null, data };
  } catch (error) {
    return { status: 'unavailable', source: 'pumpfun', endpoint, authConfigured: Boolean(jwt), note: error instanceof Error ? error.message : 'Pump.fun fetch failed.', data: null };
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizePumpTrade(row: Record<string, unknown>) {
  const signature = String(row.signature ?? row.tx_hash ?? row.transaction_hash ?? row.txHash ?? row.id ?? '') || null;
  const wallet = String(row.user ?? row.user_address ?? row.traderPublicKey ?? row.trader_public_key ?? row.buyer ?? row.seller ?? '') || null;
  const isBuy = Boolean(row.is_buy ?? row.isBuy ?? row.buy);
  const solAmount = Number(row.sol_amount ?? row.solAmount ?? row.virtual_sol_reserves ?? 0) || null;
  const tokenAmount = Number(row.token_amount ?? row.tokenAmount ?? row.tokens_bought ?? row.tokens_sold ?? 0) || null;
  const timestampRaw = row.timestamp ?? row.created_timestamp ?? row.createdAt ?? row.created_at;
  const timestamp = typeof timestampRaw === 'number' ? new Date(timestampRaw > 2_000_000_000 ? timestampRaw : timestampRaw * 1000).toISOString() : typeof timestampRaw === 'string' ? timestampRaw : null;
  return { timestamp, side: isBuy ? 'buy' as const : 'sell' as const, wallet, amount: tokenAmount, priceUsd: null, volumeUsd: null, txHash: signature, source: 'pumpfun' as const, solAmount };
}
