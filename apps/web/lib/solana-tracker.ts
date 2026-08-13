import 'server-only';

export type SolanaTrackerStatus = 'ok' | 'not-configured' | 'unauthorized' | 'rate-limited' | 'provider-error' | 'unavailable';

export type SolanaTrackerResult<T = unknown> = {
  status: SolanaTrackerStatus;
  source: 'solana-tracker';
  data: T | null;
  latencyMs: number | null;
  httpStatus?: number | null;
  note?: string | null;
};

type FetchOptions = {
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

const DEFAULT_BASE_URL = 'https://data.solanatracker.io';
const DEFAULT_TIMEOUT_MS = 4_500;

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value: string | null) {
  const parsed = validHttpUrl(value);
  if (!parsed) return DEFAULT_BASE_URL;
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function getSolanaTrackerConfig() {
  const rawKey = clean(process.env.SOLANATRACKER_API_KEY);
  const rawBase = clean(process.env.SOLANATRACKER_BASE_URL);
  const keyLooksLikeUrl = Boolean(validHttpUrl(rawKey));
  const baseUrl = normalizeBaseUrl(rawBase ?? (keyLooksLikeUrl ? rawKey : null));
  const apiKey = keyLooksLikeUrl ? null : rawKey;
  return {
    configured: Boolean(apiKey || keyLooksLikeUrl),
    apiKey,
    baseUrl,
    keyLooksLikeUrl,
    authMode: apiKey ? 'x-api-key' : keyLooksLikeUrl ? 'url-shaped-env-as-base-url' : 'not-configured',
    note: keyLooksLikeUrl ? 'SOLANATRACKER_API_KEY is URL-shaped; treating it as a custom base URL/proxy and not echoing it as a header secret.' : null
  };
}

function classifyStatus(response: Response): SolanaTrackerStatus {
  if (response.ok) return 'ok';
  if (response.status === 401 || response.status === 403) return 'unauthorized';
  if (response.status === 429) return 'rate-limited';
  if (response.status >= 500) return 'provider-error';
  return 'unavailable';
}

function noteForStatus(status: SolanaTrackerStatus, response?: Response) {
  if (status === 'not-configured') return 'SOLANATRACKER_API_KEY not configured.';
  if (!response) return null;
  if (status === 'unauthorized') return `Solana Tracker ${response.status}: verify API key/base URL and plan access.`;
  if (status === 'rate-limited') return 'Solana Tracker rate limited the request.';
  if (status === 'provider-error') return `Solana Tracker provider error ${response.status}.`;
  if (status === 'unavailable') return `Solana Tracker ${response.status} ${response.statusText}.`;
  return null;
}

export async function solanaTrackerFetch<T = unknown>(path: string, options: FetchOptions = {}): Promise<SolanaTrackerResult<T>> {
  const config = getSolanaTrackerConfig();
  const started = Date.now();
  if (!config.configured) return { status: 'not-configured', source: 'solana-tracker', data: null, latencyMs: null, httpStatus: null, note: noteForStatus('not-configured') };

  const url = new URL(`${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { accept: 'application/json', ...(options.headers ?? {}) };
    if (config.apiKey) headers['x-api-key'] = config.apiKey;
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers });
    const status = classifyStatus(response);
    const data = response.ok ? await response.json().catch(() => null) as T | null : null;
    return { status, source: 'solana-tracker', data, latencyMs: Date.now() - started, httpStatus: response.status, note: status === 'ok' ? config.note : noteForStatus(status, response) ?? config.note };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Solana Tracker request failed.';
    return { status: 'unavailable', source: 'solana-tracker', data: null, latencyMs: Date.now() - started, httpStatus: null, note: message === 'This operation was aborted' ? `Solana Tracker timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.` : message };
  } finally {
    clearTimeout(timeout);
  }
}

export function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function arrayFromUnknown(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const object = objectRecord(value);
  if (Array.isArray(object.data)) return object.data;
  if (Array.isArray(object.trades)) return object.trades;
  if (Array.isArray(object.items)) return object.items;
  if (Array.isArray(object.holders)) return object.holders;
  return [];
}

export function numberFrom(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export async function getSolanaTrackerPrice(token: string) {
  return solanaTrackerFetch<Record<string, unknown>>('/price', { query: { token, priceChanges: true } });
}

export async function getSolanaTrackerToken(token: string) {
  return solanaTrackerFetch<Record<string, unknown>>(`/tokens/${encodeURIComponent(token)}`);
}

export async function getSolanaTrackerHolders(token: string, limit = 50) {
  return solanaTrackerFetch<Record<string, unknown>>(`/tokens/${encodeURIComponent(token)}/holders`, { query: { limit } });
}

export async function getSolanaTrackerChart(token: string, interval = '5m') {
  return solanaTrackerFetch<Record<string, unknown> | unknown[]>(`/chart/${encodeURIComponent(token)}`, { query: { type: interval } });
}

export async function getSolanaTrackerTrades(token: string, limit = 100) {
  return solanaTrackerFetch<Record<string, unknown> | unknown[]>(`/trades/${encodeURIComponent(token)}`, { query: { limit } });
}

export async function getSolanaTrackerCredits() {
  return solanaTrackerFetch<Record<string, unknown>>('/credits');
}
