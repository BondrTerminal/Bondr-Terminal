import { getHeliusApiKey } from '../../../lib/solana-rpc';
import { normalizePumpTrade, pumpfunFetch } from '../../../lib/indexers/pumpfun';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const dynamic = 'force-dynamic';

const DEX_TIMEOUT_MS = 2_500;
const GECKO_TIMEOUT_MS = 3_500;
const HELIUS_TIMEOUT_MS = 3_500;
const BIRDEYE_TIMEOUT_MS = 3_500;
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type ProviderStatus = 'ok' | 'empty' | 'unavailable' | 'not-configured' | 'rate-limited';
type TradeConfidence = 'high' | 'medium' | 'low';
type TradeAttributionStatus = 'wallet-attributed' | 'transfer-inferred' | 'pool-sender-only' | 'unattributed';

type DexPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string };
  quoteToken?: { address?: string; symbol?: string };
  liquidity?: { usd?: number };
};

type IndexedTrade = {
  timestamp: string | null;
  side: 'buy' | 'sell' | 'unknown';
  wallet: string | null;
  amount: number | null;
  priceUsd: number | null;
  volumeUsd: number | null;
  txHash: string | null;
  source: 'geckoterminal' | 'birdeye' | 'helius' | 'solscan' | 'pumpfun';
  provider: 'geckoterminal' | 'birdeye' | 'helius' | 'solscan' | 'pumpfun';
  confidence: TradeConfidence;
  attributionStatus: TradeAttributionStatus;
};

type GeckoTrade = {
  id?: string;
  attributes?: {
    block_timestamp?: string;
    tx_hash?: string;
    tx_from_address?: string;
    kind?: string;
    volume_in_usd?: string;
    price_from_in_usd?: string;
    price_to_in_usd?: string;
    from_token_amount?: string;
    to_token_amount?: string;
  };
};

type HeliusTransaction = {
  signature?: string;
  timestamp?: number;
  type?: string;
  source?: string;
  feePayer?: string;
  tokenTransfers?: Array<{ mint?: string; tokenAmount?: number; fromUserAccount?: string; toUserAccount?: string }>;
};

type ProviderResult<T> = { rows: T[]; status: ProviderStatus; latencyMs: number; note?: string | null; [key: string]: unknown };

type BirdeyeTx = {
  blockUnixTime?: number;
  blockTime?: string;
  txHash?: string;
  tx_hash?: string;
  owner?: string;
  signer?: string;
  side?: string;
  type?: string;
  amount?: number | string;
  price?: number | string;
  priceUsd?: number | string;
  volumeUsd?: number | string;
  value?: number | string;
  tokenAmount?: number | string;
  token_amount?: number | string;
  amountIn?: number | string;
  amountOut?: number | string;
  volume?: number | string;
  volume_usd?: number | string;
  valueUsd?: number | string;
  usdValue?: number | string;
  tokenPrice?: number | string;
  token_price?: number | string;
  priceUSD?: number | string;
  base?: Record<string, unknown>;
  quote?: Record<string, unknown>;
  token?: Record<string, unknown>;
  from?: Record<string, unknown>;
  to?: Record<string, unknown>;
  basePrice?: number | string;
  quotePrice?: number | string;
  pricePair?: number | string;
};

type TradeTapeCache = { observedAt: string; mint: string; primary: string; trades: IndexedTrade[] };

const TRADE_TAPE_CACHE_DIR = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'trade-tape-cache');

function cachePath(mint: string) { return join(TRADE_TAPE_CACHE_DIR, `${mint}.json`); }

function readTradeCache(mint: string): TradeTapeCache | null {
  try {
    const path = cachePath(mint);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as TradeTapeCache;
  } catch { return null; }
}

function writeTradeCache(mint: string, primary: string, trades: IndexedTrade[]) {
  if (!trades.length) return;
  try {
    const path = cachePath(mint);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ observedAt: new Date().toISOString(), mint, primary, trades: trades.slice(0, 300) } satisfies TradeTapeCache, null, 2));
  } catch { /* cache is best effort */ }
}

async function timedProvider<T>(fn: () => Promise<{ rows: T[]; status: ProviderStatus; note?: string | null; [key: string]: unknown }>, fallbackNote: string): Promise<ProviderResult<T>> {
  const started = Date.now();
  try {
    const result = await fn();
    return { ...result, rows: result.rows, status: result.status, note: result.note ?? null, latencyMs: Date.now() - started };
  } catch (error) {
    return { rows: [], status: 'unavailable', latencyMs: Date.now() - started, note: error instanceof Error ? error.message : fallbackNote };
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timeout);
  }
}

function sameMint(a?: string, b?: string) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function pairScore(pair: DexPair, mint: string) {
  const baseMatch = sameMint(pair.baseToken?.address, mint) ? 1_000_000_000 : 0;
  const quoteMatch = sameMint(pair.quoteToken?.address, mint) ? 100_000_000 : 0;
  return baseMatch + quoteMatch + (pair.liquidity?.usd ?? 0);
}

function normalizeSide(kind?: string): 'buy' | 'sell' | 'unknown' {
  const normalized = (kind ?? '').toLowerCase();
  if (normalized.includes('buy')) return 'buy';
  if (normalized.includes('sell')) return 'sell';
  return 'unknown';
}

function numberFrom(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function primitiveShape(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return Object.fromEntries(Object.entries(row).slice(0, 40).map(([key, value]) => {
    if (value === null || value === undefined) return [key, String(value)];
    if (typeof value === 'object') return [key, Array.isArray(value) ? `array(${value.length})` : `object{${Object.keys(value as Record<string, unknown>).slice(0, 12).join(',')}}`];
    const text = String(value);
    return [key, `${typeof value}:${text.length > 80 ? `${text.slice(0, 80)}…` : text}`];
  }));
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function birdeyeTokenLeg(item: BirdeyeTx, mint: string) {
  const candidates = [objectRecord(item.base), objectRecord(item.quote), objectRecord(item.from), objectRecord(item.to), objectRecord(item.token)];
  return candidates.find((candidate) => sameMint(String(candidate.address ?? ''), mint)) ?? candidates[0] ?? {};
}

function birdeyeQuoteLeg(item: BirdeyeTx, mint: string) {
  const candidates = [objectRecord(item.quote), objectRecord(item.base), objectRecord(item.from), objectRecord(item.to)];
  return candidates.find((candidate) => candidate.address && !sameMint(String(candidate.address), mint)) ?? candidates[0] ?? {};
}

function withTradeMeta<T extends Omit<IndexedTrade, 'provider' | 'confidence' | 'attributionStatus'>>(trade: T): IndexedTrade {
  const provider = trade.source;
  const wallet = trade.wallet;
  const attributionStatus: TradeAttributionStatus = provider === 'birdeye' && wallet
    ? 'wallet-attributed'
    : provider === 'helius' && wallet
      ? 'transfer-inferred'
      : provider === 'geckoterminal' && wallet
        ? 'pool-sender-only'
        : provider === 'pumpfun' && wallet
          ? 'wallet-attributed'
          : 'unattributed';
  const confidence: TradeConfidence = attributionStatus === 'wallet-attributed' && trade.priceUsd !== null
    ? 'high'
    : attributionStatus === 'transfer-inferred' || attributionStatus === 'pool-sender-only'
      ? 'medium'
      : 'low';
  return { ...trade, provider, confidence, attributionStatus };
}

async function findBestDexPair(mint: string): Promise<DexPair | null> {
  const response = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, DEX_TIMEOUT_MS, { headers: { accept: 'application/json' } });
  if (!response.ok) return null;
  const payload = await response.json() as { pairs?: DexPair[] };
  const pairs = (payload.pairs ?? []).filter((pair) => pair.chainId === 'solana' && pair.pairAddress && (sameMint(pair.baseToken?.address, mint) || sameMint(pair.quoteToken?.address, mint)));
  return pairs.sort((a, b) => pairScore(b, mint) - pairScore(a, mint))[0] ?? null;
}

async function fetchGeckoTrades(pairAddress: string | null, limit: number): Promise<ProviderResult<IndexedTrade>> {
  return timedProvider(async () => {
    if (!pairAddress) return { rows: [], status: 'unavailable', note: 'No Solana pool found for GeckoTerminal trade lookup.' };
    const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/trades?limit=${Math.min(Math.max(limit, 1), 100)}`;
    const response = await fetchWithTimeout(url, GECKO_TIMEOUT_MS, { headers: { accept: 'application/json' } });
    if (response.status === 429) return { rows: [], status: 'rate-limited', note: 'GeckoTerminal rate limited trade-tape request.' };
    if (!response.ok) return { rows: [], status: 'unavailable', note: `GeckoTerminal ${response.status} ${response.statusText}` };
    const payload = await response.json() as { data?: GeckoTrade[] };
    const rows = (payload.data ?? []).map((row): IndexedTrade => {
      const attr = row.attributes ?? {};
      return withTradeMeta({
        timestamp: attr.block_timestamp ?? null,
        side: normalizeSide(attr.kind),
        wallet: attr.tx_from_address ?? null,
        amount: attr.from_token_amount ? Number(attr.from_token_amount) : attr.to_token_amount ? Number(attr.to_token_amount) : null,
        priceUsd: attr.price_to_in_usd ? Number(attr.price_to_in_usd) : attr.price_from_in_usd ? Number(attr.price_from_in_usd) : null,
        volumeUsd: attr.volume_in_usd ? Number(attr.volume_in_usd) : null,
        txHash: attr.tx_hash ?? row.id ?? null,
        source: 'geckoterminal'
      });
    });
    return { rows, status: rows.length ? 'ok' : 'empty', note: rows.length ? null : 'GeckoTerminal returned no recent pool trades.' };
  }, 'GeckoTerminal unavailable.');
}

async function fetchHeliusTrades(mint: string, limit: number): Promise<ProviderResult<IndexedTrade>> {
  return timedProvider(async () => {
    const apiKey = getHeliusApiKey();
    if (!apiKey) return { rows: [], status: 'not-configured', note: 'HELIUS_API_KEY or Helius RPC api-key not configured.' };
    const url = `https://api.helius.xyz/v0/addresses/${mint}/transactions?api-key=${encodeURIComponent(apiKey)}&limit=${Math.min(Math.max(limit, 1), 100)}`;
    const response = await fetchWithTimeout(url, HELIUS_TIMEOUT_MS, { headers: { accept: 'application/json' } });
    if (response.status === 429) return { rows: [], status: 'rate-limited', note: 'Helius rate limited parsed transaction request.' };
    if (response.status === 401 || response.status === 403) return { rows: [], status: 'unavailable', note: `Helius ${response.status} ${response.statusText}: verify HELIUS_API_KEY value/scope in Vercel.` };
    if (!response.ok) return { rows: [], status: 'unavailable', note: `Helius ${response.status} ${response.statusText}` };
    const rawRows = await response.json() as HeliusTransaction[];
    const rows = rawRows.flatMap((row): IndexedTrade[] => {
      const transfers = (row.tokenTransfers ?? []).filter((transfer) => sameMint(transfer.mint, mint) && (transfer.tokenAmount ?? 0) > 0);
      return transfers.map((transfer) => {
        const feePayer = row.feePayer ?? null;
        const wallet = feePayer ?? transfer.toUserAccount ?? transfer.fromUserAccount ?? null;
        const side = feePayer && transfer.toUserAccount === feePayer ? 'buy' : feePayer && transfer.fromUserAccount === feePayer ? 'sell' : 'unknown';
        return withTradeMeta({
          timestamp: row.timestamp ? new Date(row.timestamp * 1000).toISOString() : null,
          side,
          wallet,
          amount: transfer.tokenAmount ?? null,
          priceUsd: null,
          volumeUsd: null,
          txHash: row.signature ?? null,
          source: 'helius'
        });
      });
    }).filter((trade, index, all) => trade.txHash ? all.findIndex((item) => item.txHash === trade.txHash && item.wallet === trade.wallet && item.amount === trade.amount) === index : true)
      .slice(0, Math.min(Math.max(limit, 1), 100));
    return { rows, status: rows.length ? 'ok' : 'empty', note: rows.length ? null : 'Helius returned no parsed token-transfer trades.' };
  }, 'Helius unavailable.');
}

async function fetchBirdeyeTrades(mint: string, limit: number): Promise<ProviderResult<IndexedTrade>> {
  return timedProvider(async () => {
    const apiKey = process.env.BIRDEYE_API_KEY?.trim();
    if (!apiKey) return { rows: [], status: 'not-configured', note: 'BIRDEYE_API_KEY not configured.' };
    const url = `https://public-api.birdeye.so/defi/txs/token?address=${encodeURIComponent(mint)}&offset=0&limit=${Math.min(Math.max(limit, 1), 50)}`;
    const response = await fetchWithTimeout(url, BIRDEYE_TIMEOUT_MS, { headers: { accept: 'application/json', 'x-chain': 'solana', 'X-API-KEY': apiKey } });
    if (response.status === 429) return { rows: [], status: 'rate-limited', note: 'Birdeye rate limited token tx request.' };
    if (response.status === 401 || response.status === 403) return { rows: [], status: 'unavailable', note: `Birdeye ${response.status} ${response.statusText}: verify BIRDEYE_API_KEY value and Data Services plan access.` };
    if (!response.ok) return { rows: [], status: 'unavailable', note: `Birdeye ${response.status} ${response.statusText}` };
    const payload = await response.json() as { data?: { items?: BirdeyeTx[]; solana?: BirdeyeTx[]; transactions?: BirdeyeTx[]; txs?: BirdeyeTx[] } | BirdeyeTx[]; items?: BirdeyeTx[]; success?: boolean; message?: string };
    const dataObject = !Array.isArray(payload.data) && payload.data && typeof payload.data === 'object' ? payload.data : null;
    const items = Array.isArray(payload.data) ? payload.data : dataObject?.items ?? dataObject?.solana ?? dataObject?.transactions ?? dataObject?.txs ?? payload.items ?? [];
    const rows = items.map((item): IndexedTrade => {
      const token = birdeyeTokenLeg(item, mint);
      const quote = birdeyeQuoteLeg(item, mint);
      const amount = numberFrom(item.amount, item.tokenAmount, item.token_amount, item.amountOut, item.amountIn, token.uiAmount, token.uiChangeAmount, token.amount, quote.uiAmount);
      const priceUsd = numberFrom(item.priceUsd, item.priceUSD, item.price, item.tokenPrice, item.token_price, token.price, token.nearestPrice, item.basePrice, item.pricePair);
      const quoteUiAmount = numberFrom(quote.uiAmount, quote.uiChangeAmount);
      const quotePrice = numberFrom(quote.price, quote.nearestPrice, item.quotePrice);
      const volumeUsd = numberFrom(item.volumeUsd, item.valueUsd, item.usdValue, item.volume_usd, item.value, item.volume, quoteUiAmount !== null && quotePrice !== null ? Math.abs(quoteUiAmount * quotePrice) : null, amount !== null && priceUsd !== null ? Math.abs(amount * priceUsd) : null);
      return withTradeMeta({
      timestamp: item.blockUnixTime ? new Date(item.blockUnixTime * 1000).toISOString() : item.blockTime ?? null,
      side: normalizeSide(item.side ?? item.type),
      wallet: item.owner ?? item.signer ?? null,
      amount,
      priceUsd,
      volumeUsd,
      txHash: item.txHash ?? item.tx_hash ?? null,
      source: 'birdeye'
      });
    }).filter((trade) => trade.wallet || trade.txHash);
    const payloadShape = Array.isArray(payload.data) ? 'data[]' : dataObject ? `data{${Object.keys(dataObject).slice(0, 8).join(',')}}` : `root{${Object.keys(payload).slice(0, 8).join(',')}}`;
    return { rows, status: rows.length ? 'ok' : 'empty', note: rows.length ? null : `Birdeye returned no token tx rows. Payload shape: ${payloadShape}${payload.message ? `; message: ${payload.message}` : ''}`, payloadShape, sampleKeys: items[0] ? Object.keys(items[0]).sort() : [], samplePrimitiveShape: primitiveShape(items[0] as Record<string, unknown> | undefined) };
  }, 'Birdeye unavailable.');
}

async function fetchSolscanTrades(): Promise<ProviderResult<IndexedTrade>> {
  return timedProvider(async () => {
    const configured = Boolean(process.env.SOLSCAN_API_KEY?.trim() || process.env.SOLSCAN_PRO_API_KEY?.trim());
    if (!configured) return { rows: [], status: 'not-configured', note: 'SOLSCAN_API_KEY or SOLSCAN_PRO_API_KEY not configured.' };
    return { rows: [], status: 'unavailable', note: 'Solscan trade endpoint is provider-pending; do not guess a paid API shape without verified docs/key scope.' };
  }, 'Solscan trade feed unavailable.');
}

async function fetchPumpfunTrades(mint: string, limit: number): Promise<ProviderResult<IndexedTrade>> {
  return timedProvider(async () => {
    const pumpfun = await pumpfunFetch<Array<Record<string, unknown>>>(`/trades/all/${mint}`, { query: { limit: Math.min(Math.max(limit, 1), 100), offset: 0, minimumSize: 0 } });
    const rows = (pumpfun.data ?? []).map((row) => normalizePumpTrade(row)).map((trade): IndexedTrade => withTradeMeta({
      timestamp: trade.timestamp,
      side: trade.side,
      wallet: trade.wallet,
      amount: trade.amount,
      priceUsd: trade.priceUsd,
      volumeUsd: trade.volumeUsd,
      txHash: trade.txHash,
      source: 'pumpfun'
    })).filter((trade) => trade.wallet || trade.txHash).slice(0, Math.min(Math.max(limit, 1), 100));
    const notPumpToken = !rows.length && String(pumpfun.note ?? '').includes('404');
    return { rows, status: rows.length ? 'ok' : pumpfun.status === 'ok' ? 'empty' : notPumpToken ? 'empty' : 'unavailable', note: rows.length ? null : notPumpToken ? 'Not a Pump.fun/bonding token; Pump.fun tape does not apply.' : pumpfun.note ?? 'Pump.fun returned no trade rows.', pumpfunStatus: pumpfun.status, tokenScope: notPumpToken ? 'not-pump-token' : 'pumpfun' };
  }, 'Pump.fun trade feed unavailable.');
}

function summarize(trades: IndexedTrade[]) {
  const now = Date.now();
  const windows = { m5: 5 * 60_000, h1: 60 * 60_000, h24: 24 * 60 * 60_000 };
  const result = { m5: { buys: 0, sells: 0, volumeUsd: 0 }, h1: { buys: 0, sells: 0, volumeUsd: 0 }, h24: { buys: 0, sells: 0, volumeUsd: 0 } };
  for (const trade of trades) {
    const ts = trade.timestamp ? Date.parse(trade.timestamp) : 0;
    if (!Number.isFinite(ts) || ts <= 0) continue;
    for (const [key, ms] of Object.entries(windows) as Array<[keyof typeof result, number]>) {
      if (now - ts <= ms) {
        if (trade.side === 'buy') result[key].buys += 1;
        if (trade.side === 'sell') result[key].sells += 1;
        result[key].volumeUsd += trade.volumeUsd ?? 0;
      }
    }
  }
  return result;
}

function choosePrimary(results: Record<string, ProviderResult<IndexedTrade>>) {
  const priority = ['birdeye', 'helius', 'solscan', 'pumpfun', 'geckoterminal'] as const;
  for (const key of priority) if (results[key].rows.length) return key;
  return 'none';
}

export async function GET(request: Request) {
  const started = Date.now();
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim();
  const limit = Number(searchParams.get('limit') ?? '40');
  if (!mint || !MINT_RE.test(mint)) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Missing or invalid mint query parameter.', execution: 'live-index-read' }, { status: 400 });

  const pairResult = await timedProvider<DexPair>(async () => {
    const pair = await findBestDexPair(mint);
    return { rows: pair ? [pair] : [], status: pair ? 'ok' : 'empty', note: pair ? null : 'DexScreener found no Solana pool for this mint.' };
  }, 'DexScreener pair lookup unavailable.');
  const pair = pairResult.rows[0] ?? null;

  const [birdeye, helius, solscan, pumpfun, gecko] = await Promise.all([
    fetchBirdeyeTrades(mint, limit),
    fetchHeliusTrades(mint, limit),
    fetchSolscanTrades(),
    fetchPumpfunTrades(mint, limit),
    fetchGeckoTrades(pair?.pairAddress ?? null, limit)
  ]);

  const providers = { birdeye, helius, solscan, pumpfun, geckoterminal: gecko };
  const primary = choosePrimary(providers);
  const liveTrades = primary === 'none' ? [] : providers[primary].rows;
  if (liveTrades.length) writeTradeCache(mint, primary, liveTrades);
  const cached = liveTrades.length ? null : readTradeCache(mint);
  const trades = liveTrades.length ? liveTrades : cached?.trades ?? [];
  const effectivePrimary = liveTrades.length ? primary : cached?.primary ? `${cached.primary}-cache` : primary;
  const blockers = Object.entries(providers).filter(([, result]) => result.status !== 'ok').map(([provider, result]) => `${provider}: ${result.status}${result.note ? ` — ${result.note}` : ''}`);
  const optionalProviderGaps = [
    birdeye.status === 'not-configured' ? 'Birdeye not configured: wallet-attributed token tx history unavailable.' : null,
    helius.status === 'not-configured' ? 'Helius not configured: parsed token-transfer fallback unavailable.' : null
    , solscan.status === 'not-configured' ? 'Solscan not configured: Solscan trade fallback unavailable.' : null
  ].filter((item): item is string => Boolean(item));
  const latencyMs = Date.now() - started;

  const tradeTape = {
    status: liveTrades.length ? 'ok' : trades.length ? 'stale-cache' : 'empty',
    primary: effectivePrimary,
    rows: trades.length,
    blockers,
    optionalProviderGaps,
    latencyMs,
    providerLatencyMs: {
      dexscreenerPair: pairResult.latencyMs,
      birdeye: birdeye.latencyMs,
      helius: helius.latencyMs,
      solscan: solscan.latencyMs,
      pumpfun: pumpfun.latencyMs,
      geckoterminal: gecko.latencyMs
    },
    providers: Object.fromEntries(Object.entries(providers).map(([provider, result]) => [provider, { status: result.status, rows: result.rows.length, latencyMs: result.latencyMs, note: result.note ?? null, payloadShape: typeof result.payloadShape === 'string' ? result.payloadShape : null, sampleKeys: Array.isArray(result.sampleKeys) ? result.sampleKeys : null, samplePrimitiveShape: result.samplePrimitiveShape ?? null }])),
    recommendedFixes: [
      'Add Helius or Birdeye for wallet-attributed trade tape.',
      'Use /api/market-data/probe-token to pick an active memecoin mint instead of USDC for tape testing.'
    ],
    cache: cached ? { observedAt: cached.observedAt, reason: 'live-provider-empty-or-rate-limited' } : null,
    note: liveTrades.length ? `Using ${primary} trade rows.` : trades.length ? `Using cached ${cached?.primary} trade rows because live providers were empty/rate-limited.` : 'No recent trade rows from current providers. Add Helius/Birdeye or load a more active token.'
  };

  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    mint,
    trades,
    tradeTape,
    summary: summarize(trades),
    sources: {
      trades: {
        primary: effectivePrimary,
        status: liveTrades.length ? 'ok' : trades.length ? 'stale-cache' : 'empty',
        note: tradeTape.note,
        pairAddress: pair?.pairAddress ?? null,
        dex: pair?.dexId ?? null,
        blockers,
        optionalProviderGaps,
        latencyMs,
        providerLatencyMs: tradeTape.providerLatencyMs
      },
      providers: {
        dexscreenerPair: { status: pairResult.status, latencyMs: pairResult.latencyMs, note: pairResult.note ?? null, pairAddress: pair?.pairAddress ?? null, dex: pair?.dexId ?? null },
        birdeye: { status: birdeye.status, latencyMs: birdeye.latencyMs, note: birdeye.note ?? null, rows: birdeye.rows.length },
        helius: { status: helius.status, latencyMs: helius.latencyMs, note: helius.note ?? null, rows: helius.rows.length },
        solscan: { status: solscan.status, latencyMs: solscan.latencyMs, note: solscan.note ?? null, rows: solscan.rows.length },
        pumpfun: { status: pumpfun.status, latencyMs: pumpfun.latencyMs, note: pumpfun.note ?? null, rows: pumpfun.rows.length },
        geckoterminal: { status: gecko.status, latencyMs: gecko.latencyMs, note: gecko.note ?? null, rows: gecko.rows.length }
      },
      rawTransactions: {
        primary: 'helius',
        status: helius.status,
        note: helius.note ?? null,
        rows: helius.rows.slice(0, 10).map((row) => ({ signature: row.txHash, timestamp: row.timestamp, source: row.source, feePayer: row.wallet }))
      }
    },
    fallbackSource: effectivePrimary === 'none' || effectivePrimary === 'geckoterminal' ? null : effectivePrimary,
    execution: 'live-index-read'
  });
}
