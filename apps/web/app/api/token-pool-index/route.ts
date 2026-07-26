export const dynamic = 'force-dynamic';

import { dexKind, sameMint, sortMainLiquidityPairs } from '../../../lib/dex-pair-priority';

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DEX_TIMEOUT_MS = 7_000;
const BITQUERY_TIMEOUT_MS = 8_000;

type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  txns?: { h24?: { buys?: number; sells?: number }; h6?: { buys?: number; sells?: number }; h1?: { buys?: number; sells?: number }; m5?: { buys?: number; sells?: number } };
  pairCreatedAt?: number;
};


type BitqueryPoolAge = { status: 'ok' | 'unavailable' | 'not-configured'; source: 'bitquery'; firstSeenAt: string | null; note: string | null };

async function fetchBitqueryPoolAge(mint: string): Promise<BitqueryPoolAge> {
  const key = process.env.BITQUERY_API_KEY?.trim();
  if (!key) return { status: 'not-configured', source: 'bitquery', firstSeenAt: null, note: 'BITQUERY_API_KEY not configured; using DexScreener pairCreatedAt for pool age.' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BITQUERY_TIMEOUT_MS);
  try {
    const query = `query PoolAge($mint: String!) { Solana { DEXTradeByTokens(where: {Trade: {Currency: {MintAddress: {is: $mint}}}}, orderBy: {ascending: Block_Time}, limit: {count: 1}) { Block { Time } Transaction { Signature } Trade { Dex { ProtocolName } Market { MarketAddress } } } } }`;
    const response = await fetch('https://streaming.bitquery.io/eap', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${key}` },
      cache: 'no-store',
      body: JSON.stringify({ query, variables: { mint } })
    });
    if (!response.ok) return { status: 'unavailable', source: 'bitquery', firstSeenAt: null, note: `Bitquery ${response.status} ${response.statusText}` };
    const payload = await response.json() as { data?: { Solana?: { DEXTradeByTokens?: Array<{ Block?: { Time?: string } }> } }; errors?: unknown[] };
    const firstSeenAt = payload.data?.Solana?.DEXTradeByTokens?.[0]?.Block?.Time ?? null;
    return { status: firstSeenAt ? 'ok' : 'unavailable', source: 'bitquery', firstSeenAt, note: firstSeenAt ? 'Pool age from earliest Bitquery DEXTradeByTokens row.' : (payload.errors?.length ? `Bitquery returned errors: ${JSON.stringify(payload.errors).slice(0, 180)}` : 'Bitquery returned no DEX trade rows for this mint.') };
  } catch (error) {
    return { status: 'unavailable', source: 'bitquery', firstSeenAt: null, note: error instanceof Error ? error.message : 'Bitquery pool age lookup failed.' };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEX_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim();
  if (!mint || !MINT_RE.test(mint)) return Response.json({ error: 'Missing or invalid mint query parameter.' }, { status: 400 });

  try {
    const [response, bitqueryAge] = await Promise.all([fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${mint}`), fetchBitqueryPoolAge(mint)]);
    if (!response.ok) return Response.json({ error: `DexScreener ${response.status} ${response.statusText}` }, { status: 502 });
    const payload = await response.json() as { pairs?: DexPair[] };
    const pairs = sortMainLiquidityPairs((payload.pairs ?? [])
      .filter((pair) => pair.chainId === 'solana' && (sameMint(pair.baseToken?.address, mint) || sameMint(pair.quoteToken?.address, mint))), mint);
    const best = pairs[0] ?? null;
    const liquidityUsd = pairs.reduce((sum, pair) => sum + (pair.liquidity?.usd ?? 0), 0);
    const volume24h = pairs.reduce((sum, pair) => sum + (pair.volume?.h24 ?? 0), 0);
    const venues = Array.from(new Set(pairs.map((pair) => dexKind(pair.dexId))));

    return Response.json({
      status: 'ok',
      observedAt: new Date().toISOString(),
      mint,
      source: 'dexscreener',
      summary: {
        pairCount: pairs.length,
        venues,
        liquidityUsd,
        volume24h,
        bestDex: best?.dexId ?? null,
        bestPairAddress: best?.pairAddress ?? null,
        bestPairUrl: best?.url ?? null,
        priceUsd: best?.priceUsd ?? null,
        marketCap: best?.marketCap ?? best?.fdv ?? null,
        pairCreatedAt: best?.pairCreatedAt ? new Date(best.pairCreatedAt).toISOString() : null,
        poolAgeSource: bitqueryAge.status === 'ok' ? 'bitquery' : 'dexscreener',
        firstSeenAt: bitqueryAge.firstSeenAt ?? (best?.pairCreatedAt ? new Date(best.pairCreatedAt).toISOString() : null)
      },
      sources: { bitquery: bitqueryAge, dexscreener: { status: 'ok', note: 'Pairs/liquidity/volume from DexScreener. Main pool ranking prioritizes token/SOL or token/USDC Raydium/PumpSwap/Orca liquidity before Meteora/side pools.' } },
      pairs: pairs.slice(0, 20).map((pair) => ({
        dex: pair.dexId ?? null,
        kind: dexKind(pair.dexId),
        pairAddress: pair.pairAddress ?? null,
        url: pair.url ?? null,
        base: pair.baseToken ?? null,
        quote: pair.quoteToken ?? null,
        priceUsd: pair.priceUsd ?? null,
        liquidityUsd: pair.liquidity?.usd ?? 0,
        volume24h: pair.volume?.h24 ?? 0,
        txns: pair.txns ?? null,
        pairCreatedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null
      })),
      execution: 'live-index-read'
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Pool index unavailable.', execution: 'live-index-read' }, { status: 500 });
  }
}
