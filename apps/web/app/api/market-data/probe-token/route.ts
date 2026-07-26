export const dynamic = 'force-dynamic';

const DEX_TIMEOUT_MS = 4_000;
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkYKH4mWWU4wL4hQw';

type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string; name?: string };
  quoteToken?: { address?: string; symbol?: string; name?: string };
  liquidity?: { usd?: number };
  volume?: { h24?: number; h1?: number; m5?: number };
  txns?: { h24?: { buys?: number; sells?: number }; h1?: { buys?: number; sells?: number }; m5?: { buys?: number; sells?: number } };
};

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEX_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store', headers: { accept: 'application/json' } });
  } finally {
    clearTimeout(timeout);
  }
}

function same(a?: string, b?: string) { return Boolean(a && b && a.toLowerCase() === b.toLowerCase()); }
function txCount(pair: DexPair, window: 'm5' | 'h1' | 'h24') { return (pair.txns?.[window]?.buys ?? 0) + (pair.txns?.[window]?.sells ?? 0); }
function isStableOrNative(address?: string) { return same(address, SOL_MINT) || same(address, USDC_MINT) || same(address, USDT_MINT); }
function candidateMint(pair: DexPair) {
  const base = pair.baseToken?.address;
  const quote = pair.quoteToken?.address;
  if (base && !isStableOrNative(base)) return base;
  if (quote && !isStableOrNative(quote)) return quote;
  return null;
}
function score(pair: DexPair) {
  return txCount(pair, 'm5') * 100_000 + txCount(pair, 'h1') * 2_000 + (pair.volume?.h1 ?? 0) + Math.min(pair.liquidity?.usd ?? 0, 250_000) / 10;
}

export async function GET() {
  const observedAt = new Date().toISOString();
  const configured = process.env.RECOMMENDED_PROBE_MINT?.trim();
  if (configured) {
    return Response.json({ status: 'ok', observedAt, source: 'env', recommendedProbeMint: configured, reason: 'RECOMMENDED_PROBE_MINT configured by operator.', readOnly: true, liveTradingEnabled: process.env.LIVE_TRADING_ENABLED === 'true' });
  }

  try {
    const queries = ['pump solana', 'raydium solana', 'solana meme'];
    const payloads = await Promise.all(queries.map(async (query) => {
      const response = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) return [] as DexPair[];
      const payload = await response.json() as { pairs?: DexPair[] };
      return payload.pairs ?? [];
    }));
    const seen = new Set<string>();
    const candidates = payloads.flat()
      .filter((pair) => pair.chainId === 'solana' && pair.pairAddress)
      .map((pair) => ({ pair, mint: candidateMint(pair) }))
      .filter((item): item is { pair: DexPair; mint: string } => Boolean(item.mint))
      .filter((item) => {
        if (seen.has(item.mint)) return false;
        seen.add(item.mint);
        return true;
      })
      .sort((a, b) => score(b.pair) - score(a.pair));
    const best = candidates[0];
    if (!best) return Response.json({ status: 'partial', observedAt, source: 'dexscreener-search', recommendedProbeMint: null, reason: 'No active non-SOL/non-stable Solana candidate found from DexScreener search.', readOnly: true }, { status: 200 });
    return Response.json({
      status: 'ok',
      observedAt,
      source: 'dexscreener-search',
      recommendedProbeMint: best.mint,
      reason: 'Selected active Solana pool candidate by recent tx count, h1 volume, and liquidity; use for trade-tape testing instead of USDC.',
      candidate: {
        mint: best.mint,
        symbol: same(best.pair.baseToken?.address, best.mint) ? best.pair.baseToken?.symbol : best.pair.quoteToken?.symbol,
        name: same(best.pair.baseToken?.address, best.mint) ? best.pair.baseToken?.name : best.pair.quoteToken?.name,
        dex: best.pair.dexId ?? null,
        pairAddress: best.pair.pairAddress ?? null,
        url: best.pair.url ?? null,
        txnsM5: txCount(best.pair, 'm5'),
        txnsH1: txCount(best.pair, 'h1'),
        volumeH1: best.pair.volume?.h1 ?? 0,
        volume24h: best.pair.volume?.h24 ?? 0,
        liquidityUsd: best.pair.liquidity?.usd ?? 0
      },
      readOnly: true,
      liveTradingEnabled: process.env.LIVE_TRADING_ENABLED === 'true'
    });
  } catch (error) {
    return Response.json({ status: 'partial', observedAt, source: 'dexscreener-search', recommendedProbeMint: null, error: error instanceof Error ? error.message : 'Probe token lookup failed.', readOnly: true }, { status: 200 });
  }
}
