export const dynamic = 'force-dynamic';

import { sameMint, sortMainLiquidityPairs } from '../../../lib/dex-pair-priority';

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TIMEOUT_MS = 7_000;

type DexPair = { chainId?: string; dexId?: string; pairAddress?: string; baseToken?: { address?: string }; quoteToken?: { address?: string }; liquidity?: { usd?: number } };
type GeckoOhlcv = { data?: { attributes?: { ohlcv_list?: Array<[number, number, number, number, number, number]> } } };

const FRAME_MAP: Record<string, { timeframe: 'minute' | 'hour' | 'day'; aggregate: string; limit: string }> = {
  '1m': { timeframe: 'minute', aggregate: '1', limit: '120' },
  '5m': { timeframe: 'minute', aggregate: '5', limit: '120' },
  '15m': { timeframe: 'minute', aggregate: '15', limit: '120' },
  '1h': { timeframe: 'hour', aggregate: '1', limit: '168' },
  '4h': { timeframe: 'hour', aggregate: '4', limit: '168' },
  '1d': { timeframe: 'day', aggregate: '1', limit: '180' }
};

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' }, cache: 'no-store' }); }
  finally { clearTimeout(timeout); }
}

async function bestPool(mint: string): Promise<DexPair | null> {
  const response = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
  if (!response.ok) return null;
  const payload = await response.json() as { pairs?: DexPair[] };
  return sortMainLiquidityPairs((payload.pairs ?? [])
    .filter((pair) => pair.chainId === 'solana' && pair.pairAddress && (sameMint(pair.baseToken?.address, mint) || sameMint(pair.quoteToken?.address, mint))), mint)[0] ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim();
  const frame = searchParams.get('frame')?.trim() || '5m';
  const config = FRAME_MAP[frame] ?? FRAME_MAP['5m'];
  if (!mint || !MINT_RE.test(mint)) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Missing or invalid mint query parameter.', candles: [], execution: 'live-index-read' }, { status: 400 });

  try {
    const pool = await bestPool(mint);
    if (!pool?.pairAddress) return Response.json({ status: 'unavailable', observedAt: new Date().toISOString(), mint, frame, source: 'dexscreener/geckoterminal', candles: [], note: 'No Solana pool found for chart candles.', execution: 'live-index-read' });
    const url = new URL(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool.pairAddress}/ohlcv/${config.timeframe}`);
    url.searchParams.set('aggregate', config.aggregate);
    url.searchParams.set('limit', config.limit);
    url.searchParams.set('currency', 'usd');
    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) return Response.json({ status: 'partial', observedAt: new Date().toISOString(), mint, frame, source: 'geckoterminal', pool: { pairAddress: pool.pairAddress, dex: pool.dexId ?? null }, candles: [], error: `GeckoTerminal OHLCV ${response.status} ${response.statusText}`, note: 'Chart provider unavailable or rate-limited; terminal should keep other live market sections running.', execution: 'live-index-read' }, { status: 200 });
    const payload = await response.json() as GeckoOhlcv;
    const candles = (payload.data?.attributes?.ohlcv_list ?? []).map(([ts, open, high, low, close, volume]) => ({
      timestamp: new Date(ts * 1000).toISOString(), open, high, low, close, volume
    })).reverse();
    return Response.json({
      status: 'ok',
      observedAt: new Date().toISOString(),
      mint,
      frame,
      source: 'geckoterminal',
      pool: { pairAddress: pool.pairAddress, dex: pool.dexId ?? null },
      candles,
      execution: 'live-index-read'
    });
  } catch (error) {
    return Response.json({ status: 'partial', observedAt: new Date().toISOString(), mint, frame, source: 'geckoterminal', candles: [], error: error instanceof Error ? error.message : 'Chart index unavailable.', note: 'Chart provider failed; non-chart terminal data may still be usable.', execution: 'live-index-read' }, { status: 200 });
  }
}
