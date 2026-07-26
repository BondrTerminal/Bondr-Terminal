export const dynamic = 'force-dynamic';

import { dexKind, sameMint, sortMainLiquidityPairs } from '../../../lib/dex-pair-priority';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const JUPITER_TIMEOUT_MS = 5_000;
const DEX_TIMEOUT_MS = 5_000;

type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  txns?: { h24?: { buys?: number; sells?: number }; h6?: { buys?: number; sells?: number }; h1?: { buys?: number; sells?: number }; m5?: { buys?: number; sells?: number } };
  pairCreatedAt?: number;
};

type JupiterRoute = {
  inAmount?: string;
  outAmount?: string;
  priceImpactPct?: string;
  routePlan?: Array<{ swapInfo?: { label?: string; ammKey?: string; inputMint?: string; outputMint?: string } }>;
};

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' }, next: { revalidate: 10 } });
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeTransactions(pairs: DexPair[]) {
  const empty = { buys: 0, sells: 0 };
  return pairs.reduce((acc, pair) => {
    for (const window of ['m5', 'h1', 'h6', 'h24'] as const) {
      acc[window].buys += pair.txns?.[window]?.buys ?? 0;
      acc[window].sells += pair.txns?.[window]?.sells ?? 0;
    }
    return acc;
  }, { m5: { ...empty }, h1: { ...empty }, h6: { ...empty }, h24: { ...empty } });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim();
  if (!mint) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Missing mint query parameter.', execution: 'read-only' }, { status: 400 });
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Invalid Solana mint/address shape.', execution: 'read-only' }, { status: 400 });

  const dexResult = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, DEX_TIMEOUT_MS)
    .then(async (response) => response.ok ? await response.json() as { pairs?: DexPair[] } : { pairs: [] })
    .catch(() => ({ pairs: [] as DexPair[] }));
  const pairs = (dexResult.pairs ?? []).filter((pair) => pair.chainId === 'solana' && (sameMint(pair.baseToken?.address, mint) || sameMint(pair.quoteToken?.address, mint)));
  const sortedPairs = sortMainLiquidityPairs(pairs, mint);
  const bestPair = sortedPairs[0];
  const txns = summarizeTransactions(sortedPairs);
  const venues = Array.from(new Set(sortedPairs.map((pair) => dexKind(pair.dexId))));

  let jupiter: { status: string; routeLabels: string[]; priceImpactPct: string | null; inAmount: string | null; outAmount: string | null; note?: string } = {
    status: mint === SOL_MINT ? 'same-token' : 'pending',
    routeLabels: [],
    priceImpactPct: null,
    inAmount: null,
    outAmount: null,
    note: mint === SOL_MINT ? 'SOL input and output are identical for this mint.' : undefined
  };

  if (mint !== SOL_MINT) {
    const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${mint}&amount=10000000&slippageBps=100`;
    try {
      const quoteResponse = await fetchWithTimeout(quoteUrl, JUPITER_TIMEOUT_MS);
      if (quoteResponse.ok) {
        const quote = await quoteResponse.json() as JupiterRoute;
        jupiter = {
          status: 'ok',
          routeLabels: quote.routePlan?.map((route) => route.swapInfo?.label).filter(Boolean) as string[] ?? [],
          priceImpactPct: quote.priceImpactPct ?? null,
          inAmount: quote.inAmount ?? null,
          outAmount: quote.outAmount ?? null
        };
      } else {
        jupiter = { ...jupiter, status: 'unavailable', note: `Jupiter quote failed ${quoteResponse.status}` };
      }
    } catch (error) {
      jupiter = { ...jupiter, status: 'unavailable', note: error instanceof Error ? error.message : 'Jupiter quote unavailable' };
    }
  }

  return Response.json({
    status: bestPair ? 'ok' : 'partial',
    mint,
    observedAt: new Date().toISOString(),
    sources: {
      dexscreener: { status: pairs.length ? 'ok' : 'unavailable', pairCount: pairs.length },
      jupiter,
      raydium: { status: venues.includes('raydium') ? 'ok' : 'unavailable', pairCount: sortedPairs.filter((pair) => dexKind(pair.dexId) === 'raydium').length },
      pumpswap: { status: venues.includes('pumpswap') ? 'ok' : 'unavailable', pairCount: sortedPairs.filter((pair) => dexKind(pair.dexId) === 'pumpswap').length }
    },
    bestPair: bestPair ? {
      dex: bestPair.dexId,
      url: bestPair.url,
      pairAddress: bestPair.pairAddress,
      priceUsd: bestPair.priceUsd,
      liquidityUsd: bestPair.liquidity?.usd ?? 0,
      volume24h: bestPair.volume?.h24 ?? 0,
      txns: bestPair.txns ?? null
    } : null,
    transactions: txns,
    venues,
    pairs: sortedPairs.slice(0, 8).map((pair) => ({
      dex: pair.dexId,
      kind: dexKind(pair.dexId),
      pairAddress: pair.pairAddress,
      url: pair.url,
      liquidityUsd: pair.liquidity?.usd ?? 0,
      volume24h: pair.volume?.h24 ?? 0,
      txns: pair.txns ?? null
    })),
    execution: 'read-only'
  });
}
