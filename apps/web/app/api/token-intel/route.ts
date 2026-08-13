import { Connection, PublicKey } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';
import { sameMint, sortMainLiquidityPairs } from '../../../lib/dex-pair-priority';

export const dynamic = 'force-dynamic';

const DEXSCREENER_TIMEOUT_MS = 5_000;
const RPC_TIMEOUT_MS = 6_000;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_ADDRESS_IN_TEXT_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

function extractMint(input: string | null | undefined) {
  const trimmed = (input ?? '').trim();
  if (SOLANA_ADDRESS_RE.test(trimmed)) return trimmed;
  const matches = trimmed.match(SOLANA_ADDRESS_IN_TEXT_RE) ?? [];
  return matches.find((candidate) => SOLANA_ADDRESS_RE.test(candidate)) ?? '';
}

type OnChainTokenInfo = {
  status: 'ok' | 'unavailable';
  rpcProvider: string;
  rpcConfigured: boolean;
  decimals: number | null;
  supplyUi: number | null;
  rawSupply: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  executable: boolean | null;
  note: string | null;
};

type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number; base?: number; quote?: number };
  volume?: { h24?: number; h6?: number; h1?: number };
  txns?: { h24?: { buys?: number; sells?: number }; h6?: { buys?: number; sells?: number }; h1?: { buys?: number; sells?: number }; m5?: { buys?: number; sells?: number } };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs = RPC_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('RPC request timed out.')), timeoutMs))
  ]);
}

async function fetchOnChainTokenInfo(mint: string): Promise<OnChainTokenInfo> {
  const rpc = configuredSolanaRpc();
  const connection = new Connection(rpc.url, 'confirmed');
  try {
    const pubkey = new PublicKey(mint);
    const [supplyResult, accountResult] = await Promise.all([
      withTimeout(connection.getTokenSupply(pubkey, 'confirmed')),
      withTimeout(connection.getParsedAccountInfo(pubkey, 'confirmed'))
    ]);
    const parsed = accountResult.value?.data && 'parsed' in accountResult.value.data ? accountResult.value.data.parsed as { info?: { mintAuthority?: string | null; freezeAuthority?: string | null } } : null;
    return {
      status: 'ok',
      rpcProvider: rpc.provider,
      rpcConfigured: rpc.configured,
      decimals: supplyResult.value.decimals,
      supplyUi: supplyResult.value.uiAmount,
      rawSupply: supplyResult.value.amount,
      mintAuthority: parsed?.info?.mintAuthority ?? null,
      freezeAuthority: parsed?.info?.freezeAuthority ?? null,
      executable: accountResult.value?.executable ?? null,
      note: null
    };
  } catch (error) {
    return {
      status: 'unavailable',
      rpcProvider: rpc.provider,
      rpcConfigured: rpc.configured,
      decimals: null,
      supplyUi: null,
      rawSupply: null,
      mintAuthority: null,
      freezeAuthority: null,
      executable: null,
      note: error instanceof Error ? error.message : 'On-chain token lookup failed.'
    };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function displayToken(pair: DexPair, mint: string) {
  if (sameMint(pair.baseToken?.address, mint)) return pair.baseToken;
  if (sameMint(pair.quoteToken?.address, mint)) return pair.quoteToken;
  return pair.baseToken;
}

function counterToken(pair: DexPair, mint: string) {
  if (sameMint(pair.baseToken?.address, mint)) return pair.quoteToken;
  if (sameMint(pair.quoteToken?.address, mint)) return pair.baseToken;
  return pair.quoteToken;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = extractMint(searchParams.get('mint'));
  if (!mint) return Response.json({ error: 'Missing mint query parameter.' }, { status: 400 });

  try {
    const onChain = await fetchOnChainTokenInfo(mint);
    const response = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      headers: { accept: 'application/json' },
      next: { revalidate: 15 }
    }, DEXSCREENER_TIMEOUT_MS);
    if (!response.ok) return Response.json({ error: `DexScreener lookup failed: ${response.status}` }, { status: 502 });

    const payload = await response.json() as { pairs?: DexPair[] };
    const pairs = (payload.pairs ?? []).filter((pair) => pair.chainId === 'solana' && (sameMint(pair.baseToken?.address, mint) || sameMint(pair.quoteToken?.address, mint)));
    const sortedPairs = sortMainLiquidityPairs(pairs, mint);
    const bestPair = sortedPairs[0];
    const warnings = [
      pairs.length === 0 ? 'No Solana pairs found.' : '',
      bestPair && (bestPair.liquidity?.usd ?? 0) < 10_000 ? 'Low liquidity: route quality may be poor.' : '',
      bestPair && !bestPair.pairCreatedAt ? 'Pool age unavailable.' : '',
      onChain.status !== 'ok' ? `On-chain token info unavailable: ${onChain.note}` : '',
      onChain.mintAuthority ? 'Mint authority is still set.' : '',
      onChain.freezeAuthority ? 'Freeze authority is still set.' : ''
    ].filter(Boolean);

    return Response.json({
      mint,
      source: onChain.status === 'ok' ? 'dexscreener+solana-rpc' : 'dexscreener',
      onChain,
      pairCount: pairs.length,
      bestPair: bestPair ? {
        dex: bestPair.dexId,
        pairAddress: bestPair.pairAddress,
        url: bestPair.url,
        base: displayToken(bestPair, mint),
        quote: counterToken(bestPair, mint),
        priceUsd: bestPair.priceUsd,
        liquidityUsd: bestPair.liquidity?.usd ?? 0,
        volume24h: bestPair.volume?.h24 ?? 0,
        txns: bestPair.txns ?? null,
        fdv: bestPair.fdv ?? null,
        marketCap: bestPair.marketCap ?? null,
        pairCreatedAt: bestPair.pairCreatedAt ?? null
      } : null,
      pairs: sortedPairs.slice(0, 8).map((pair) => ({
        dex: pair.dexId,
        pairAddress: pair.pairAddress,
        base: displayToken(pair, mint)?.symbol,
        quote: counterToken(pair, mint)?.symbol,
        liquidityUsd: pair.liquidity?.usd ?? 0,
        volume24h: pair.volume?.h24 ?? 0,
        txns: pair.txns ?? null,
        url: pair.url
      })),
      riskFlags: warnings,
      execution: 'disabled-read-only'
    });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'DexScreener lookup timed out.'
      : 'DexScreener lookup failed.';
    return Response.json({ error: message, execution: 'disabled-read-only' }, { status: 504 });
  }
}
