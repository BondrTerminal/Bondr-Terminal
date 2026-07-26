import { Connection, PublicKey } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const FRESH_AGE_DAYS = Number(process.env.FRESH_WALLET_MAX_AGE_DAYS ?? '7');
const LOW_ACTIVITY_TX_COUNT = Number(process.env.FRESH_WALLET_MAX_TX_COUNT ?? '5');

type TradeRow = { wallet?: string | null; side?: string; timestamp?: string | null; txHash?: string | null; volumeUsd?: number | string | null; amount?: number | string | null; priceUsd?: number | string | null; source?: string | null };

async function getTrades(origin: string, mint: string, limit: number): Promise<TradeRow[]> {
  const response = await fetch(`${origin}/api/token-transactions?mint=${mint}&limit=${limit}`, { cache: 'no-store' });
  if (!response.ok) return [];
  const payload = await response.json() as { trades?: TradeRow[] };
  return payload.trades ?? [];
}

async function walletHistory(origin: string, connection: Connection, wallet: string) {
  const funding = await fetch(`${origin}/api/wallet-funding-index?wallet=${wallet}&limit=100`, { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).catch(() => null) as null | { rows?: Array<{ rows?: unknown[]; firstSeenAt?: string | null; lastSeenAt?: string | null; transactionCountSampled?: number }> };
  const indexed = funding?.rows?.[0];
  if (indexed) return { txCountSampled: indexed.transactionCountSampled ?? 0, firstSeenAt: indexed.firstSeenAt ?? null, lastSeenAt: indexed.lastSeenAt ?? null, fundingRows: indexed.rows?.length ?? 0, fundingSource: 'wallet-funding-index', rows: indexed.rows ?? [] };
  const signatures = await connection.getSignaturesForAddress(new PublicKey(wallet), { limit: 100 }, 'confirmed');
  const times = signatures.map((sig) => sig.blockTime).filter((v): v is number => typeof v === 'number');
  const firstSeen = times.length ? Math.min(...times) : null;
  const lastSeen = times.length ? Math.max(...times) : null;
  return { txCountSampled: signatures.length, firstSeenAt: firstSeen ? new Date(firstSeen * 1000).toISOString() : null, lastSeenAt: lastSeen ? new Date(lastSeen * 1000).toISOString() : null, fundingRows: 0, fundingSource: 'solana-rpc-signatures', rows: [] as unknown[] };
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim();
  const limit = Number(searchParams.get('limit') ?? '60');
  if (!mint || !ADDRESS_RE.test(mint)) return Response.json({ error: 'Missing or invalid mint.' }, { status: 400 });

  const rpc = configuredSolanaRpc();
  const connection = new Connection(rpc.url, 'confirmed');
  const trades = await getTrades(origin, mint, limit);
  const wallets = Array.from(new Set(trades.map((trade) => trade.wallet).filter((wallet): wallet is string => Boolean(wallet && ADDRESS_RE.test(wallet))))).slice(0, 30);
  const now = Date.now();
  const rows = await Promise.all(wallets.map(async (wallet) => {
    try {
      const history = await walletHistory(origin, connection, wallet);
      const firstMs = history.firstSeenAt ? Date.parse(history.firstSeenAt) : null;
      const ageDays = firstMs ? (now - firstMs) / 86_400_000 : null;
      const freshByAge = ageDays != null && ageDays <= FRESH_AGE_DAYS;
      const freshByActivity = history.txCountSampled <= LOW_ACTIVITY_TX_COUNT;
      const relatedTrades = trades.filter((trade) => trade.wallet === wallet).sort((a, b) => String(a.timestamp ?? '').localeCompare(String(b.timestamp ?? '')));
      let buys = 0, sells = 0, boughtTokens = 0, soldTokens = 0, buyVolumeUsd = 0, sellVolumeUsd = 0;
      const sources = new Set<string>();
      for (const trade of relatedTrades) {
        const amount = Number(trade.amount ?? 0) || 0;
        const volume = (Number(trade.volumeUsd ?? 0) || 0) || ((Number(trade.priceUsd ?? 0) || 0) * amount);
        if (trade.side === 'buy') { buys += 1; boughtTokens += amount; buyVolumeUsd += volume; }
        if (trade.side === 'sell') { sells += 1; soldTokens += amount; sellVolumeUsd += volume; }
        if (trade.source) sources.add(String(trade.source));
      }
      const firstTradeAt = relatedTrades[0]?.timestamp ?? null;
      const lastTradeAt = relatedTrades.at(-1)?.timestamp ?? null;
      const firstTradeMs = firstTradeAt ? Date.parse(firstTradeAt) : null;
      const lastTradeMs = lastTradeAt ? Date.parse(lastTradeAt) : null;
      const holdWindowHours = firstTradeMs && lastTradeMs && lastTradeMs >= firstTradeMs ? Number(((lastTradeMs - firstTradeMs) / 3_600_000).toFixed(2)) : null;
      const avgEntryUsd = boughtTokens && buyVolumeUsd ? buyVolumeUsd / boughtTokens : null;
      const avgExitUsd = soldTokens && sellVolumeUsd ? sellVolumeUsd / soldTokens : null;
      const netTokens = boughtTokens - soldTokens;
      const fundingSample = Array.isArray(history.rows) ? history.rows[0] as { from?: string | null; amountSol?: number | null; timestamp?: string | null } | undefined : undefined;
      const classification = freshByAge ? 'young-wallet' : freshByActivity ? 'low-activity-wallet' : buys && !sells ? 'new-buyer' : sells > buys ? 'seller' : 'established-wallet';
      return {
        wallet,
        ...history,
        ageDays: ageDays == null ? null : Number(ageDays.toFixed(2)),
        tradeCountInSample: relatedTrades.length,
        firstTradeAt,
        lastTradeAt,
        holdWindowHours,
        firstTradeSide: relatedTrades[0]?.side ?? null,
        lastTradeSide: relatedTrades.at(-1)?.side ?? null,
        buys,
        sells,
        boughtTokens,
        soldTokens,
        netTokens,
        buyVolumeUsd,
        sellVolumeUsd,
        avgEntryUsd,
        avgExitUsd,
        fundingFrom: fundingSample?.from ?? null,
        fundingAmountSol: fundingSample?.amountSol ?? null,
        fundingAt: fundingSample?.timestamp ?? null,
        fresh: freshByAge || freshByActivity,
        reason: classification,
        tags: [freshByAge ? 'fresh-age' : null, freshByActivity ? 'low-activity' : null, buys && !sells ? 'buyer-only' : null, sells ? 'has-sells' : null, fundingSample?.from ? 'funding-source' : null].filter(Boolean),
        tradeSources: Array.from(sources)
      };
    } catch (error) {
      return { wallet, status: 'unavailable', fresh: null, reason: error instanceof Error ? error.message : 'history unavailable' };
    }
  }));
  const classified = rows.filter((row) => typeof row.fresh === 'boolean');
  const freshCount = classified.filter((row) => row.fresh).length;
  return Response.json({ status: 'ok', observedAt: new Date().toISOString(), mint, source: 'token-transactions+wallet-funding-index', rpcProvider: rpc.provider, thresholds: { freshAgeDays: FRESH_AGE_DAYS, lowActivityTxCount: LOW_ACTIVITY_TX_COUNT }, summary: { tradeRows: trades.length, walletsClassified: classified.length, freshCount, freshPct: classified.length ? Number(((freshCount / classified.length) * 100).toFixed(2)) : null, buyerOnlyCount: rows.filter((row) => (row as { tags?: string[] }).tags?.includes('buyer-only')).length, fundedRows: rows.filter((row) => Boolean((row as { fundingFrom?: string | null }).fundingFrom)).length }, wallets: rows, execution: 'live-index-read' });
}
