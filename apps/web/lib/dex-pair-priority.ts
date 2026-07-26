export type DexPairForPriority = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string; name?: string };
  quoteToken?: { address?: string; symbol?: string; name?: string };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
};

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2q3b8wdPuWVG4bTCGxuN2dauqk';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4Fk4d4WZZmcS5vtckgyt';
const STABLE_OR_SOL_QUOTES = new Set([SOL_MINT.toLowerCase(), USDC_MINT.toLowerCase(), USDT_MINT.toLowerCase()]);

export function sameMint(a?: string, b?: string) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

export function dexKind(dexId?: string) {
  const normalized = (dexId ?? '').toLowerCase();
  if (normalized.includes('raydium')) return 'raydium';
  if (normalized.includes('pump')) return 'pumpswap';
  if (normalized.includes('orca')) return 'orca';
  if (normalized.includes('meteora')) return 'meteora';
  if (normalized.includes('openbook')) return 'openbook';
  return normalized || 'unknown';
}

function dexPriority(dexId?: string) {
  const kind = dexKind(dexId);
  if (kind === 'raydium') return 4_000_000_000;
  if (kind === 'pumpswap') return 3_500_000_000;
  if (kind === 'orca') return 3_000_000_000;
  if (kind === 'openbook') return 1_500_000_000;
  if (kind === 'meteora') return -750_000_000;
  return 0;
}

function quotePriority(pair: DexPairForPriority) {
  const quote = pair.quoteToken?.address?.toLowerCase();
  if (quote && STABLE_OR_SOL_QUOTES.has(quote)) return 2_000_000_000;
  return -300_000_000;
}

export function mainLiquidityPairScore(pair: DexPairForPriority, mint: string) {
  const tokenAsBase = sameMint(pair.baseToken?.address, mint) ? 10_000_000_000 : 0;
  const tokenAsQuote = sameMint(pair.quoteToken?.address, mint) ? 100_000_000 : 0;
  const liquidityUsd = pair.liquidity?.usd ?? 0;
  const volume24h = pair.volume?.h24 ?? 0;
  const tinySidePoolPenalty = liquidityUsd < 10_000 ? -500_000_000 : 0;
  return tokenAsBase + tokenAsQuote + quotePriority(pair) + dexPriority(pair.dexId) + tinySidePoolPenalty + liquidityUsd + volume24h / 100;
}

export function sortMainLiquidityPairs<T extends DexPairForPriority>(pairs: T[], mint: string) {
  return [...pairs].sort((a, b) => mainLiquidityPairScore(b, mint) - mainLiquidityPairScore(a, mint));
}
