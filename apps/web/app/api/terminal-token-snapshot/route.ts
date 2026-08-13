export const dynamic = 'force-dynamic';

import { getHeliusApiKey } from '../../../lib/solana-rpc';
import { getSolanaTrackerPrice, getSolanaTrackerToken, objectRecord as trackerObjectRecord, numberFrom as trackerNumberFrom } from '../../../lib/solana-tracker';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type Json = Record<string, unknown>;
type TradeRow = { wallet?: string | null; side?: string; volumeUsd?: number | string | null; priceUsd?: number | string | null; txHash?: string | null; timestamp?: string | null; amount?: number | string | null; source?: string };
type HolderRow = { owner?: string | null; tokenAccount?: string; uiAmount?: number; rawAmount?: string; decimals?: number | null; pct?: number | null; pctSupply?: number | null; ownerSolBalance?: number | null; ownerBalanceStatus?: string | null; rank?: number | null };
type DevWalletRow = { wallet?: string; soldLikely?: boolean; outgoingAmount?: number; providerStatus?: string; providerNote?: string };
type TokenBalanceRow = { id?: string | null; address?: string | null; wallet?: string | null; role?: string | null; uiAmount?: number | null; status?: string | null; balanceStatus?: string | null; source?: string | string[] | null };
type HeliusWalletTx = { signature?: string; timestamp?: number; feePayer?: string; tokenTransfers?: Array<{ mint?: string; tokenAmount?: number; fromUserAccount?: string; toUserAccount?: string }> };
type WalletLifecycle = { wallet: string; boughtTokens: number; soldTokens: number; txCount: number; firstEntryAt: string | null; lastExitAt: string | null; lastSeenAt: string | null; signatures: string[]; source: string; status: string; note: string | null };

function objectValue(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

async function readJson<T = Json>(origin: string, path: string, timeoutMs = 8_000): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${origin}${path}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return await response.json().catch(() => ({ status: 'error', httpStatus: response.status, error: response.statusText })) as T;
    return await response.json() as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'fetch failed';
    return { status: 'error', source: path, error: message === 'This operation was aborted' ? `Timed out after ${timeoutMs}ms` : message } as T;
  } finally {
    clearTimeout(timeout);
  }
}

function hoursBetween(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Number(((endMs - startMs) / 3_600_000).toFixed(2));
}

function topTraders(trades: TradeRow[], priceUsd: number | null) {
  const map = new Map<string, { wallet: string; buys: number; sells: number; boughtTokens: number; soldTokens: number; buyVolumeUsd: number; sellVolumeUsd: number; totalVolumeUsd: number; txCount: number; firstSeenAt: string | null; lastTx: string | null; lastSeenAt: string | null; sources: Set<string> }>();
  for (const trade of trades) {
    const wallet = trade.wallet;
    if (!wallet || !ADDRESS_RE.test(wallet)) continue;
    const current = map.get(wallet) ?? { wallet, buys: 0, sells: 0, boughtTokens: 0, soldTokens: 0, buyVolumeUsd: 0, sellVolumeUsd: 0, totalVolumeUsd: 0, txCount: 0, firstSeenAt: null, lastTx: null, lastSeenAt: null, sources: new Set<string>() };
    const amount = Number(trade.amount ?? 0) || 0;
    const tradePrice = Number(trade.priceUsd ?? 0) || 0;
    const volume = (Number(trade.volumeUsd ?? 0) || 0) || (tradePrice && amount ? tradePrice * amount : 0);
    if (trade.side === 'buy') { current.buys += 1; current.boughtTokens += amount; current.buyVolumeUsd += volume; }
    else if (trade.side === 'sell') { current.sells += 1; current.soldTokens += amount; current.sellVolumeUsd += volume; }
    current.totalVolumeUsd += volume;
    current.txCount += 1;
    current.lastTx = trade.txHash ?? current.lastTx;
    if (trade.timestamp) {
      if (!current.firstSeenAt || trade.timestamp < current.firstSeenAt) current.firstSeenAt = trade.timestamp;
      if (!current.lastSeenAt || trade.timestamp > current.lastSeenAt) current.lastSeenAt = trade.timestamp;
    }
    if (trade.source) current.sources.add(trade.source);
    map.set(wallet, current);
  }
  return Array.from(map.values()).map((row) => {
    const avgEntryUsd = row.boughtTokens && row.buyVolumeUsd ? row.buyVolumeUsd / row.boughtTokens : null;
    const avgExitUsd = row.soldTokens && row.sellVolumeUsd ? row.sellVolumeUsd / row.soldTokens : null;
    const netTokens = row.boughtTokens - row.soldTokens;
    const realizedPnlUsd = avgEntryUsd !== null && row.soldTokens ? row.sellVolumeUsd - (row.soldTokens * avgEntryUsd) : null;
    const unrealizedPnlUsd = avgEntryUsd !== null && priceUsd !== null && netTokens > 0 ? (priceUsd - avgEntryUsd) * netTokens : null;
    const totalPnlUsd = realizedPnlUsd !== null || unrealizedPnlUsd !== null ? (realizedPnlUsd ?? 0) + (unrealizedPnlUsd ?? 0) : null;
    const tags = [netTokens > 0 ? 'still-holding-est' : null, netTokens < 0 ? 'net-seller' : null, row.txCount >= 5 ? 'active' : null, totalPnlUsd !== null && totalPnlUsd > 0 ? 'profit' : null, totalPnlUsd !== null && totalPnlUsd < 0 ? 'loss' : null].filter((tag): tag is string => Boolean(tag));
    return { ...row, netTokens, netVolumeUsd: row.buyVolumeUsd - row.sellVolumeUsd, avgEntryUsd, avgExitUsd, realizedPnlUsd, unrealizedPnlUsd, totalPnlUsd, holdDurationHours: hoursBetween(row.firstSeenAt, row.lastSeenAt), sources: Array.from(row.sources), tags };
  }).sort((a, b) => b.totalVolumeUsd - a.totalVolumeUsd || b.txCount - a.txCount).slice(0, 50);
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function walletTradeStats(trades: TradeRow[]) {
  const map = new Map<string, { boughtTokens: number; soldTokens: number; buyVolumeUsd: number; sellVolumeUsd: number; txCount: number; firstSeenAt: string | null; lastSeenAt: string | null; sources: Set<string> }>();
  for (const trade of trades) {
    const wallet = trade.wallet;
    if (!wallet || !ADDRESS_RE.test(wallet)) continue;
    const current = map.get(wallet) ?? { boughtTokens: 0, soldTokens: 0, buyVolumeUsd: 0, sellVolumeUsd: 0, txCount: 0, firstSeenAt: null, lastSeenAt: null, sources: new Set<string>() };
    const amount = Number(trade.amount ?? 0) || 0;
    const explicitVolume = Number(trade.volumeUsd ?? 0) || 0;
    const price = Number(trade.priceUsd ?? 0) || 0;
    const volume = explicitVolume || (price && amount ? price * amount : 0);
    if (trade.side === 'buy') {
      current.boughtTokens += amount;
      current.buyVolumeUsd += volume;
    } else if (trade.side === 'sell') {
      current.soldTokens += amount;
      current.sellVolumeUsd += volume;
    }
    current.txCount += 1;
    if (trade.timestamp) {
      if (!current.firstSeenAt || trade.timestamp < current.firstSeenAt) current.firstSeenAt = trade.timestamp;
      if (!current.lastSeenAt || trade.timestamp > current.lastSeenAt) current.lastSeenAt = trade.timestamp;
    }
    if (trade.source) current.sources.add(trade.source);
    map.set(wallet, current);
  }
  return map;
}

async function fetchHeliusWalletLifecycle(wallet: string, mint: string, limit: number): Promise<WalletLifecycle> {
  const key = getHeliusApiKey();
  if (!key) return { wallet, boughtTokens: 0, soldTokens: 0, txCount: 0, firstEntryAt: null, lastExitAt: null, lastSeenAt: null, signatures: [], source: 'helius-wallet-history', status: 'not-configured', note: 'HELIUS_API_KEY or Helius RPC api-key not configured.' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_500);
  try {
    const response = await fetch(`https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${encodeURIComponent(key)}&limit=${Math.min(Math.max(limit, 1), 100)}`, { signal: controller.signal, cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) return { wallet, boughtTokens: 0, soldTokens: 0, txCount: 0, firstEntryAt: null, lastExitAt: null, lastSeenAt: null, signatures: [], source: 'helius', status: 'unavailable', note: `Helius ${response.status} ${response.statusText}` };
    const rows = await response.json() as HeliusWalletTx[];
    let boughtTokens = 0;
    let soldTokens = 0;
    let firstEntryAt: string | null = null;
    let lastExitAt: string | null = null;
    let lastSeenAt: string | null = null;
    const signatures: string[] = [];
    for (const tx of rows) {
      const timestamp = tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : null;
      let touched = false;
      for (const transfer of tx.tokenTransfers ?? []) {
        if (!transfer.mint || transfer.mint.toLowerCase() !== mint.toLowerCase()) continue;
        const amount = Number(transfer.tokenAmount ?? 0) || 0;
        if (amount <= 0) continue;
        if (transfer.toUserAccount === wallet) {
          boughtTokens += amount;
          touched = true;
          if (timestamp && (!firstEntryAt || timestamp < firstEntryAt)) firstEntryAt = timestamp;
        }
        if (transfer.fromUserAccount === wallet) {
          soldTokens += amount;
          touched = true;
          if (timestamp && (!lastExitAt || timestamp > lastExitAt)) lastExitAt = timestamp;
        }
      }
      if (touched) {
        if (tx.signature) signatures.push(tx.signature);
        if (timestamp && (!lastSeenAt || timestamp > lastSeenAt)) lastSeenAt = timestamp;
      }
    }
    const txCount = signatures.length;
    return { wallet, boughtTokens, soldTokens, txCount, firstEntryAt, lastExitAt, lastSeenAt, signatures: signatures.slice(0, 5), source: 'helius-wallet-history', status: txCount ? 'ok' : 'empty', note: txCount ? null : 'Helius wallet history returned no matching token transfers in sampled window.' };
  } catch (error) {
    return { wallet, boughtTokens: 0, soldTokens: 0, txCount: 0, firstEntryAt: null, lastExitAt: null, lastSeenAt: null, signatures: [], source: 'helius-wallet-history', status: 'unavailable', note: error instanceof Error ? error.message : 'Helius wallet history failed.' };
  } finally {
    clearTimeout(timeout);
  }
}

async function holderWalletLifecycles(holders: HolderRow[], mint: string, enabled: boolean, requestedLimit: number) {
  const uniqueOwners = Array.from(new Set(holders.map((row) => row.owner).filter((owner): owner is string => typeof owner === 'string' && ADDRESS_RE.test(owner))));
  const walletLimit = enabled ? Math.min(Math.max(requestedLimit, 1), 50) : 0;
  const owners = uniqueOwners.slice(0, walletLimit);
  if (!owners.length) return { rows: new Map<string, WalletLifecycle>(), status: enabled ? 'empty' : 'disabled', source: 'helius-wallet-history', walletCountReturned: 0, walletLimit, isTruncated: false, nextCursor: null, coverageLabel: enabled ? 'No holder owner wallets available for lifecycle enrichment' : 'Holder wallet lifecycle enrichment disabled', note: enabled ? 'No holder owner wallets available for lifecycle enrichment.' : 'Holder wallet lifecycle enrichment disabled for smoke/fast mode.' };
  const rows = await Promise.all(owners.map((owner) => fetchHeliusWalletLifecycle(owner, mint, 100)));
  const isTruncated = uniqueOwners.length > owners.length;
  return {
    rows: new Map(rows.map((row) => [row.wallet, row])),
    status: rows.some((row) => row.status === 'ok') ? 'ok' : rows.some((row) => row.status === 'not-configured') ? 'not-configured' : 'limited',
    source: 'helius-wallet-history',
    walletCountReturned: owners.length,
    walletLimit,
    isTruncated,
    nextCursor: null,
    coverageLabel: isTruncated ? `Lifecycle enriched for top ${owners.length}/${uniqueOwners.length} holder wallets` : `Lifecycle enriched for ${owners.length} holder wallets`,
    note: rows.find((row) => row.note)?.note ?? (isTruncated ? 'Lifecycle enrichment is bounded to avoid hammering Helius wallet-history reads.' : null)
  };
}

function holderSummary(stats: Json | null, trades: TradeRow[], pool: Json | null, lifecycle: Awaited<ReturnType<typeof holderWalletLifecycles>>) {
  const holders = (stats?.holders ?? {}) as { rows?: HolderRow[]; totalHolders?: number | null; uniqueOwnerCount?: number | null; tokenAccountCount?: number | null; source?: string; status?: string; note?: string; walletCountReturned?: number; walletLimit?: number; isTruncated?: boolean; nextCursor?: string | null; paginationStatus?: string; coverageLabel?: string };
  const rows = holders.rows ?? [];
  const supply = numberOrNull((stats?.supply as Json | undefined)?.uiAmount);
  const priceUsd = numberOrNull(((pool?.summary as Json | undefined)?.priceUsd));
  const tape = walletTradeStats(trades);
  return {
    ...holders,
    priceUsd,
    rows: rows.map((row, index) => {
      const owner = row.owner ?? null;
      const amount = Number(row.uiAmount ?? 0) || 0;
      const pctSupply = numberOrNull(row.pctSupply ?? row.pct) ?? (supply && amount ? Number(((amount / supply) * 100).toFixed(4)) : null);
      const valueUsd = priceUsd !== null ? amount * priceUsd : null;
      const statsForWallet = owner ? tape.get(owner) : null;
      const walletLifecycle = owner ? lifecycle.rows.get(owner) : undefined;
      const pnlStatus = statsForWallet
        ? 'trade-tape-priced'
        : walletLifecycle?.txCount
          ? 'transfer-only'
          : lifecycle.status === 'not-configured' || lifecycle.status === 'limited'
            ? 'provider-limited'
            : 'balance-only';
      const boughtTokens = statsForWallet?.boughtTokens ?? (walletLifecycle?.txCount ? walletLifecycle.boughtTokens : null);
      const soldTokens = statsForWallet?.soldTokens ?? (walletLifecycle?.txCount ? walletLifecycle.soldTokens : null);
      const buyVolumeUsd = statsForWallet?.buyVolumeUsd ?? null;
      const sellVolumeUsd = statsForWallet?.sellVolumeUsd ?? null;
      const avgEntryUsd = boughtTokens && buyVolumeUsd ? buyVolumeUsd / boughtTokens : null;
      const avgExitUsd = soldTokens && sellVolumeUsd ? sellVolumeUsd / soldTokens : null;
      const realizedPnlUsd = avgEntryUsd !== null && soldTokens !== null && sellVolumeUsd !== null ? sellVolumeUsd - (soldTokens * avgEntryUsd) : null;
      const unrealizedPnlUsd = avgEntryUsd !== null && priceUsd !== null ? (priceUsd - avgEntryUsd) * amount : null;
      const totalPnlUsd = realizedPnlUsd !== null || unrealizedPnlUsd !== null ? (realizedPnlUsd ?? 0) + (unrealizedPnlUsd ?? 0) : null;
      const tags = [
        index < 10 ? 'top-10' : null,
        pctSupply !== null && pctSupply >= 5 ? 'whale' : null,
        statsForWallet && statsForWallet.soldTokens > statsForWallet.boughtTokens ? 'net-seller' : null,
        statsForWallet && statsForWallet.boughtTokens > statsForWallet.soldTokens ? 'net-buyer' : null,
        !statsForWallet ? 'balance-only' : null
      ].filter((tag): tag is string => Boolean(tag));
      return {
        rank: index + 1,
        ...row,
        pctSupply,
        valueUsd,
        boughtTokens,
        soldTokens,
        netTokensFromTape: boughtTokens !== null || soldTokens !== null ? (boughtTokens ?? 0) - (soldTokens ?? 0) : null,
        buyVolumeUsd,
        sellVolumeUsd,
        avgEntryUsd,
        avgExitUsd,
        realizedPnlUsd,
        unrealizedPnlUsd,
        totalPnlUsd,
        pnlStatus,
        ownerSolBalance: typeof row.ownerSolBalance === 'number' ? row.ownerSolBalance : null,
        ownerBalanceStatus: row.ownerBalanceStatus ?? null,
        firstSeenAt: statsForWallet?.firstSeenAt ?? walletLifecycle?.firstEntryAt ?? null,
        entryAt: walletLifecycle?.firstEntryAt ?? statsForWallet?.firstSeenAt ?? null,
        exitAt: walletLifecycle?.lastExitAt ?? null,
        lastSeenAt: statsForWallet?.lastSeenAt ?? walletLifecycle?.lastSeenAt ?? null,
        txCount: statsForWallet?.txCount ?? walletLifecycle?.txCount ?? null,
        holdDurationHours: hoursBetween(statsForWallet?.firstSeenAt ?? walletLifecycle?.firstEntryAt ?? null, statsForWallet?.lastSeenAt ?? walletLifecycle?.lastSeenAt ?? null),
        lifecycleStatus: statsForWallet ? 'trade-tape-priced' : walletLifecycle?.status ?? lifecycle.status,
        lifecycleSource: statsForWallet ? 'trade-tape' : walletLifecycle?.source ?? lifecycle.source,
        lifecycleNote: statsForWallet ? null : walletLifecycle?.note ?? lifecycle.note,
        tags,
        dataSources: Array.from(new Set([holders.source, row.ownerBalanceStatus ?? null, priceUsd !== null ? 'dexscreener-price' : null, ...(statsForWallet ? Array.from(statsForWallet.sources) : []), walletLifecycle?.source ?? null].filter((source): source is string => Boolean(source))))
      };
    })
  };
}


function positionSummary(backend: Json | null, traders: ReturnType<typeof topTraders>, priceUsd: number | null) {
  const tokenBalances = ((backend?.wallets as Json | undefined)?.tokenBalances as { rows?: TokenBalanceRow[] } | undefined)?.rows ?? [];
  const traderMap = new Map(traders.map((row) => [row.wallet, row]));
  const rows = tokenBalances.map((row) => {
    const wallet = row.address ?? row.wallet ?? '';
    const amount = Number(row.uiAmount ?? 0) || 0;
    const trader = wallet ? traderMap.get(wallet) : undefined;
    const valueUsd = priceUsd !== null ? amount * priceUsd : null;
    const unrealizedPnlUsd = trader?.avgEntryUsd != null && priceUsd !== null ? (priceUsd - trader.avgEntryUsd) * amount : null;
    const totalPnlUsd = trader?.realizedPnlUsd != null || unrealizedPnlUsd != null ? (trader?.realizedPnlUsd ?? 0) + (unrealizedPnlUsd ?? 0) : null;
    return {
      wallet,
      role: row.role ?? null,
      uiAmount: amount,
      valueUsd,
      avgEntryUsd: trader?.avgEntryUsd ?? null,
      avgExitUsd: trader?.avgExitUsd ?? null,
      realizedPnlUsd: trader?.realizedPnlUsd ?? null,
      unrealizedPnlUsd,
      totalPnlUsd,
      txCount: trader?.txCount ?? null,
      firstSeenAt: trader?.firstSeenAt ?? null,
      entryAt: trader?.firstSeenAt ?? null,
      exitAt: trader?.sells ? trader.lastSeenAt : null,
      lastSeenAt: trader?.lastSeenAt ?? null,
      pnlStatus: trader ? 'trade-tape-estimate' : amount > 0 ? 'balance-value-only' : row.balanceStatus ?? row.status ?? 'empty-wallet',
      dataSources: ['wallet-token-balances', priceUsd !== null ? 'dexscreener-price' : null, trader ? 'trade-tape' : null, typeof row.source === 'string' ? row.source : null].filter((value): value is string => Boolean(value)),
      source: ['wallet-token-balances', priceUsd !== null ? 'dexscreener-price' : null, trader ? 'trade-tape' : null, typeof row.source === 'string' ? row.source : null].filter((value): value is string => Boolean(value)),
      status: trader ? 'trade-tape-estimate' : amount > 0 ? 'balance-value-only' : row.balanceStatus ?? row.status ?? 'empty-wallet'
    };
  });
  return {
    source: 'terminal-snapshot-positions',
    rows,
    summary: {
      walletCount: rows.length,
      nonZeroWallets: rows.filter((row) => row.uiAmount > 0).length,
      valuedWallets: rows.filter((row) => row.valueUsd !== null).length,
      pnlWallets: rows.filter((row) => row.totalPnlUsd !== null).length,
      totalTokens: rows.reduce((sum, row) => sum + row.uiAmount, 0),
      totalValueUsd: rows.reduce((sum, row) => sum + (row.valueUsd ?? 0), 0),
      totalPnlUsd: rows.some((row) => row.totalPnlUsd !== null) ? rows.reduce((sum, row) => sum + (row.totalPnlUsd ?? 0), 0) : null
    }
  };
}

function liveReadinessChecklist(args: { profile: string; trades: TradeRow[]; holders: ReturnType<typeof holderSummary>; tradeTape: Json; stats: Json | null; pool: Json | null; holderLifecycleStatus: string }) {
  const supply = objectValue(args.stats?.supply);
  const concentration = objectValue(args.stats?.concentration);
  const market = objectValue(args.pool?.summary);
  const tradeStatus = typeof args.tradeTape.status === 'string' ? args.tradeTape.status : args.trades.length ? 'ok' : 'empty';
  const checks = [
    { id: 'token_identity', label: 'Token identity loads', status: args.pool || args.stats ? 'pass' : 'fail', evidence: args.pool ? 'Pool/token metadata loaded.' : 'No pool/token metadata loaded.' },
    { id: 'supply_authorities', label: 'Supply/authority data', status: supply.uiAmount || args.stats?.rugcheck ? 'pass' : 'partial', evidence: supply.status ? `Supply ${String(supply.status)}.` : 'Supply falls back to RugCheck/provider metadata when RPC is unavailable.' },
    { id: 'holder_concentration', label: 'Holder concentration', status: args.holders.rows?.length ? 'pass' : 'fail', evidence: `${args.holders.rows?.length ?? 0} holder rows from ${String(args.holders.source ?? 'unknown')}.` },
    { id: 'holder_wallet_attribution', label: 'Holder wallet attribution', status: args.holderLifecycleStatus === 'ok' ? 'pass' : args.holders.rows?.length ? 'partial' : 'fail', evidence: `Lifecycle source status: ${args.holderLifecycleStatus}.` },
    { id: 'trade_tape', label: 'Nonzero trade tape', status: args.trades.length ? 'pass' : 'fail', evidence: `${args.trades.length} rows · ${String(args.tradeTape.primary ?? 'none')} · ${tradeStatus}.` },
    { id: 'market_feed', label: 'Price/liquidity/volume', status: market.priceUsd || market.liquidityUsd || market.marketCap ? 'pass' : 'partial', evidence: `Price ${market.priceUsd ?? 'n/a'} · liquidity ${market.liquidityUsd ?? 'n/a'} · mcap ${market.marketCap ?? 'n/a'}.` },
    { id: 'provider_clarity', label: 'Provider status clarity', status: 'pass', evidence: 'Snapshot includes tradeTape blockers, optionalProviderGaps, holder source, and profile.' },
    { id: 'paper_trading', label: 'Paper quote decision path', status: 'partial', evidence: 'Quote-only endpoint exists; UI decision panel must fetch quote before any execution.' },
    { id: 'execution_gates', label: 'Live execution disabled', status: 'pass', evidence: 'Snapshot is read-only; signing/broadcasting remain disabled.' }
  ];
  const failed = checks.filter((check) => check.status === 'fail').map((check) => check.id);
  const partial = checks.filter((check) => check.status === 'partial').map((check) => check.id);
  return {
    status: failed.length ? 'blocked' : partial.length ? 'partial' : 'ready-for-paper',
    profile: args.profile,
    summary: `${checks.filter((check) => check.status === 'pass').length}/${checks.length} checks passing`,
    checks,
    failed,
    partial,
    liveTradingAllowed: false,
    note: 'Live-readiness means the terminal can observe and paper-simulate; real signing/trading remains disabled until separate execution gates pass.'
  };
}

function riskVerdict(args: { stats: Json | null; pool: Json | null; trades: TradeRow[]; holders: ReturnType<typeof holderSummary>; tradeTape: Json }) {
  const concentration = objectValue(args.stats?.concentration);
  const rugcheck = objectValue(args.stats?.rugcheck);
  const lp = objectValue(args.stats?.lpBurned);
  const dev = objectValue(args.stats?.devHolding);
  const top10Pct = numberOrNull(concentration.top10Pct);
  const liquidityUsd = numberOrNull(objectValue(args.pool?.summary).liquidityUsd);
  const reasons: string[] = [];
  if (!args.trades.length) reasons.push('No recent trade tape; cannot trust live entry/exit timing.');
  if (top10Pct !== null && top10Pct >= 70) reasons.push(`Top 10 concentration is high (${top10Pct.toFixed(1)}%).`);
  if (liquidityUsd !== null && liquidityUsd < 10_000) reasons.push(`Liquidity is thin (${liquidityUsd.toFixed(0)} USD).`);
  if (rugcheck.rugged === true) reasons.push('RugCheck reports rugged=true.');
  if (dev.pct && Number(dev.pct) >= 5) reasons.push(`Dev wallets still show ${Number(dev.pct).toFixed(2)}% of supply.`);
  const authorityFlags = [rugcheck.mintAuthority ? 'mint authority present' : null, rugcheck.freezeAuthority ? 'freeze authority present' : null].filter(Boolean);
  reasons.push(...authorityFlags as string[]);
  const status = reasons.some((reason) => reason.includes('RugCheck') || reason.includes('authority') || reason.includes('high')) ? 'DO_NOT_TRADE' : reasons.length ? 'HIGH_RISK' : 'SAFE_TO_WATCH';
  return {
    status,
    liveTradingAllowed: false,
    reasons,
    checks: {
      top10Pct,
      liquidityUsd,
      holderRows: args.holders.rows?.length ?? 0,
      tradeRows: args.trades.length,
      lpStatus: lp.status ?? null,
      rugcheck: rugcheck ? { rugged: rugcheck.rugged ?? null, riskCount: Array.isArray(rugcheck.risks) ? rugcheck.risks.length : null } : null
    },
    note: status === 'SAFE_TO_WATCH' ? 'No automatic blockers in sampled data; still paper-simulate first.' : 'Risk verdict blocks live trading until reviewed.'
  };
}

function paperTradeDecision(args: { mint: string; priceUsd: number | null; tradeTape: Json; risk: ReturnType<typeof riskVerdict> }) {
  return {
    status: 'quote-required',
    execution: 'paper-only-no-sign-no-send',
    liveTradingEnabled: false,
    defaultRequest: { mint: args.mint, side: 'Buy', amount: '0.01', spendAsset: 'SOL', slippageBps: 100 },
    quoteRoute: '/api/execution-quote',
    requiredBeforeLive: ['Jupiter quote preview', 'slippage/price-impact review', 'risk verdict review', 'human confirmation', 'dry-run simulation', 'durable intent log'],
    currentPriceUsd: args.priceUsd,
    riskStatus: args.risk.status,
    tradeTapeRows: args.tradeTape.rows ?? 0,
    note: 'This panel can preview a paper decision only. It never builds, signs, or broadcasts a transaction.'
  };
}


function extractDiscoveryRows(value: Json | null, limit: number) {
  const unwrap = (input: unknown): unknown[] => {
    if (Array.isArray(input)) {
      if (input.length === 1 && Array.isArray(objectValue(input[0]).tokens)) return objectValue(input[0]).tokens as unknown[];
      return input;
    }
    const object = objectValue(input);
    if (Array.isArray(object.rank)) return object.rank as unknown[];
    if (Array.isArray(object.tokens)) return object.tokens as unknown[];
    if (Array.isArray(object.list)) return object.list as unknown[];
    if ('data' in object) return unwrap(object.data);
    return [];
  };
  const candidates = unwrap(value?.data);
  return candidates.slice(0, limit).map((item, index) => {
    const row = objectValue(item);
    const mint = row.address ?? row.tokenAddress ?? row.mint ?? row.ca ?? row.token_address ?? null;
    return {
      rank: index + 1,
      mint,
      symbol: row.symbol ?? row.ticker ?? row.name ?? 'token',
      name: row.name ?? null,
      priceUsd: numberOrNull(row.price ?? row.priceUsd),
      priceChange1hPct: numberOrNull(row.price_change_percent1h ?? row.priceChange1hPct),
      marketCapUsd: numberOrNull(row.marketCap ?? row.market_cap ?? row.fdv ?? row.fdvUsd),
      liquidityUsd: numberOrNull(row.liquidity ?? row.liquidityUsd),
      volume24hUsd: numberOrNull(row.volume24h ?? row.volume_24h ?? row.volumeUsd24h ?? row.volume),
      swaps: numberOrNull(row.swaps),
      buys: numberOrNull(row.buys),
      sells: numberOrNull(row.sells),
      source: value?.source ?? 'gmgn-query',
      status: value?.status ?? 'unknown'
    };
  }).filter((row) => row.mint || row.symbol);
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim() ?? '';
  const project = searchParams.get('project')?.trim() ?? '';
  const holderLimit = Number(searchParams.get('holderLimit') ?? '100');
  const limit = Number(searchParams.get('limit') ?? '100');
  const smoke = searchParams.get('smoke') === '1';
  const profile = searchParams.get('profile')?.trim() ?? '';
  const prototype = profile === 'prototype' || searchParams.get('prototype') === '1';
  const liveRead = profile === 'live-read' || searchParams.get('liveRead') === '1';
  const enrich = searchParams.get('enrich') === '1';
  const fastPrimary = searchParams.get('fastPrimary') === '1' || (liveRead && !enrich);
  const enrichHolderLifecycle = searchParams.get('enrichHolderLifecycle') === '1';
  const skipHeavy = smoke || prototype || fastPrimary;
  const skipTradeTape = smoke || prototype;

  if (!mint || !ADDRESS_RE.test(mint)) return Response.json({ error: 'Missing or invalid mint.' }, { status: 400 });

  const devWallets = searchParams.get('devWallets')?.trim() ?? '';
  const qMint = encodeURIComponent(mint);
  const projectParam = project ? `&project=${encodeURIComponent(project)}` : '';
  const devParam = devWallets ? `&devWallets=${encodeURIComponent(devWallets)}` : '';

  const effectiveProfile = smoke ? 'smoke' : prototype ? 'prototype' : fastPrimary ? 'primary-fast' : liveRead ? 'live-read-enriched' : 'standard';
  const boundedLimit = Math.min(Math.max(limit, 1), smoke ? 10 : prototype ? 30 : liveRead && !enrich ? 60 : 220);
  const boundedHolderLimit = Math.min(Math.max(holderLimit, 1), smoke ? 1 : prototype ? 25 : liveRead && !enrich ? 100 : 250);
  const [health, pool, marketFeed, solanaTrackerPrice, solanaTrackerToken, pumpToken, stats, transactions, fresh, bundles, devSold, pumpMigrations, backend, providerEnvAudit, gmgn, chartData, lpScan, lpPositions, walletGraph, gmgnTrending, gmgnHotSearches] = await Promise.all([
    skipHeavy ? Promise.resolve({ status: fastPrimary ? 'primary-fast-skip' : prototype ? 'prototype' : 'smoke', source: fastPrimary ? 'primary-fast' : 'prototype-skip', note: fastPrimary ? 'Skipped provider health probe during primary load; System drawer refreshes this in enrichment.' : 'Skipped provider health probe during prototype scan to avoid upstream 429 pressure.' }) : readJson(origin, '/api/indexer-health'),
    readJson(origin, `/api/token-pool-index?mint=${qMint}`),
    readJson(origin, `/api/token-market-feed?mint=${qMint}`),
    getSolanaTrackerPrice(mint),
    getSolanaTrackerToken(mint),
    fastPrimary ? Promise.resolve({ status: 'primary-fast-skip', source: 'primary-fast', note: 'Pump.fun token profile deferred to enrichment.' }) : readJson(origin, `/api/pumpfun/token?mint=${qMint}`),
    smoke ? Promise.resolve({ status: 'smoke', source: 'contract-smoke', holders: { rows: [], tokenAccountCount: null, nonZeroTokenAccounts: null, uniqueOwnerCount: null, totalHolders: null, status: 'smoke', source: 'contract-smoke', note: 'Smoke mode skips heavy RPC holder scan.' } }) : readJson(origin, `/api/token-stats?mint=${qMint}&holderListLimit=${boundedHolderLimit}${prototype ? '&profile=prototype' : liveRead ? '&fastHolders=1' : ''}${devParam}`, liveRead ? 14_000 : 10_000),
    skipTradeTape ? Promise.resolve({ status: prototype ? 'prototype' : 'smoke', source: 'prototype-skip', trades: [], sources: { trades: { primary: 'prototype-skip' } }, summary: { tradeRows: 0 }, fallbackSource: null, tradeTape: { status: prototype ? 'prototype' : 'smoke', primary: 'prototype-skip', rows: 0, blockers: [], optionalProviderGaps: [], latencyMs: null, note: 'Skipped during prototype/smoke scan to avoid upstream 429 pressure.' } }) : readJson<{ trades?: TradeRow[]; sources?: Json; summary?: Json; fallbackSource?: string | null; status?: string; tradeTape?: Json }>(origin, `/api/token-transactions?mint=${qMint}&limit=${fastPrimary ? Math.min(boundedLimit, 40) : boundedLimit}${fastPrimary ? '&fast=1' : ''}`, fastPrimary ? 4_500 : 8_000),
    skipHeavy ? Promise.resolve({ status: fastPrimary ? 'primary-fast-skip' : prototype ? 'prototype' : 'smoke', source: fastPrimary ? 'primary-fast' : 'prototype-skip', rows: [], summary: { tradeRows: 0, walletsClassified: 0, freshCount: 0, freshPct: null }, note: fastPrimary ? 'Fresh wallet classifier deferred to enrichment.' : 'Skipped during prototype scan to avoid upstream 429 pressure.' }) : readJson(origin, `/api/fresh-wallet-classifier?mint=${qMint}&limit=${boundedLimit}`),
    skipHeavy ? Promise.resolve({ status: fastPrimary ? 'primary-fast-skip' : prototype ? 'prototype' : 'smoke', source: fastPrimary ? 'primary-fast' : 'prototype-skip', clusters: [], summary: { sampledTransactions: 0, suspectedClusters: 0 }, note: fastPrimary ? 'Bundle clustering deferred to enrichment.' : 'Skipped during prototype scan to avoid upstream 429 pressure.' }) : readJson(origin, `/api/bundle-clustering-index?mint=${qMint}&limit=${boundedLimit}`),
    skipHeavy ? Promise.resolve({ status: fastPrimary ? 'primary-fast-skip' : prototype ? 'prototype' : 'smoke', source: fastPrimary ? 'primary-fast' : 'prototype-skip', wallets: [], summary: { walletsWithOutgoingTransfers: 0, totalOutgoingAmount: 0, totalIncomingAmount: 0 }, note: fastPrimary ? 'Dev-sold classifier deferred to enrichment.' : 'Skipped during prototype scan to avoid upstream 429 pressure.' }) : readJson<{ wallets?: DevWalletRow[]; summary?: Json; source?: string }>(origin, `/api/dev-sold-classifier?mint=${qMint}${devParam}&limit=${boundedLimit}`),
    skipHeavy ? Promise.resolve({ status: fastPrimary ? 'primary-fast-skip' : prototype ? 'prototype' : 'smoke', source: fastPrimary ? 'primary-fast' : 'prototype-skip', migrations: [], note: fastPrimary ? 'Migration feed deferred to enrichment.' : 'Skipped during prototype scan to avoid upstream 429 pressure.' }) : readJson(origin, `/api/pumpfun/migrations?limit=50`),
    fastPrimary ? readJson(origin, `/api/terminal-backend?mint=${qMint}${projectParam}&fast=1`) : skipHeavy ? Promise.resolve({ status: prototype ? 'prototype' : 'smoke', execution: { terminalOrders: { orders: [], execution: 'prototype-skip' }, bundleSequencer: { execution: 'prototype-skip' }, orderEngine: {} }, wallets: { rows: [], tokenBalances: { rows: [] } }, note: 'Skipped during prototype/smoke scan to keep scanner responsive.' }) : readJson(origin, `/api/terminal-backend?mint=${qMint}${projectParam}`),
    skipHeavy ? Promise.resolve({ status: fastPrimary ? 'primary-fast-skip' : prototype ? 'prototype' : 'smoke', source: fastPrimary ? 'primary-fast' : 'prototype-skip', providers: {}, note: fastPrimary ? 'Provider env audit deferred to System enrichment.' : 'Skipped provider env audit during prototype scan.' }) : readJson(origin, '/api/terminal/provider-env-audit'),
    skipHeavy ? Promise.resolve({ status: fastPrimary ? 'primary-fast-skip' : prototype ? 'prototype' : 'smoke', source: fastPrimary ? 'primary-fast' : 'prototype-skip', gmgn: { status: fastPrimary ? 'primary-fast-deferred' : 'prototype-skip', configured: false, cliInstalled: true, execution: 'read-only-cli-adapter-no-swap-no-cooking' }, note: fastPrimary ? 'GMGN readiness deferred to enrichment; GMGN execution remains read-only.' : 'Skipped GMGN readiness during prototype scan.' }) : readJson(origin, '/api/gmgn/readiness'),
    smoke ? Promise.resolve({ status: 'smoke', source: 'contract-smoke', candles: [], note: 'Smoke mode skips chart provider.' }) : readJson(origin, `/api/token-chart?mint=${qMint}&frame=${encodeURIComponent(searchParams.get('frame') ?? '5m')}`),
    skipHeavy ? Promise.resolve({ status: fastPrimary ? 'primary-fast-deferred' : smoke ? 'smoke' : 'prototype', source: fastPrimary ? 'primary-fast' : 'prototype-skip', summary: { poolsScanned: 0, lpMintsResolved: 0, unresolvedPools: 0 }, scans: [], note: fastPrimary ? 'LP lock/burn scan deferred to enrichment.' : 'Skipped LP scan during smoke/prototype scan.' }) : readJson(origin, `/api/lp-lock-burn-scanner?mint=${qMint}`),
    skipHeavy ? Promise.resolve({ status: fastPrimary ? 'primary-fast-deferred' : smoke ? 'smoke' : 'prototype', source: fastPrimary ? 'primary-fast' : 'prototype-skip', pools: [], summary: { poolsScanned: 0, positionPoolsIndexed: 0, positionPoolsClassified: 0, ownerConcentrationPctEstimate: null, confidence: 'low', limitations: [fastPrimary ? 'LP position ownership index deferred to enrichment.' : 'Smoke/prototype mode skips LP position ownership index.'] } }) : readJson(origin, `/api/lp-position-ownership-index?mint=${qMint}&profile=${encodeURIComponent(effectiveProfile)}&limit=${prototype ? 6 : 12}`),
    skipHeavy ? Promise.resolve({ status: fastPrimary ? 'primary-fast-deferred' : smoke ? 'smoke' : 'prototype', source: fastPrimary ? 'primary-fast' : 'prototype-skip', graph: { seedWallets: [], relatedWallets: [], edges: [] }, insider: { walletCount: 0, currentHolderMatches: 0, supplyPct: null, supplyPctCoverage: 'deferred', confidence: 'low', evidence: [], limitations: [fastPrimary ? 'Wallet graph index deferred to enrichment.' : 'Smoke/prototype mode skips wallet graph index.'] }, coverage: { holderRowsReturned: 0, holderLimit: 0, isTruncated: false, providersUsed: [], missingProviders: [] } }) : readJson(origin, `/api/wallet-graph-insider-index?mint=${qMint}&profile=${encodeURIComponent(effectiveProfile)}&limit=${prototype ? 40 : boundedLimit}${devParam}`),
    skipHeavy ? Promise.resolve({ status: fastPrimary ? 'primary-fast-skip' : prototype ? 'prototype' : 'smoke', source: fastPrimary ? 'primary-fast' : 'prototype-skip', data: null, note: 'GMGN trending discovery deferred.' }) : readJson(origin, `/api/gmgn/query?command=market-trending&chain=sol&interval=1h&limit=30`),
    skipHeavy ? Promise.resolve({ status: fastPrimary ? 'primary-fast-skip' : prototype ? 'prototype' : 'smoke', source: fastPrimary ? 'primary-fast' : 'prototype-skip', data: null, note: 'GMGN hot-search discovery deferred.' }) : readJson(origin, `/api/gmgn/query?command=hot-searches&chain=sol&interval=1h&limit=30`)
  ]);

  const trades = transactions?.trades ?? [];
  const transactionSources = objectValue(transactions?.sources);
  const transactionTradeSource = objectValue(transactionSources.trades);
  const tradeTape = (transactions as { tradeTape?: Json } | null)?.tradeTape ?? { status: trades.length ? 'ok' : 'empty', primary: typeof transactionTradeSource.primary === 'string' ? transactionTradeSource.primary : 'unknown', rows: trades.length, blockers: [], optionalProviderGaps: [], latencyMs: null, note: trades.length ? null : 'No recent trade rows from current providers. Add Helius/Birdeye or load a more active token.' };
  const snapshotPriceUsd = numberOrNull(((pool as Json | null)?.summary as Json | undefined)?.priceUsd);
  const traderRows = topTraders(trades, snapshotPriceUsd);
  const statsHolderRows = (((stats as Json | null)?.holders as Json | undefined)?.rows ?? []) as HolderRow[];
  const holderLifecycle = await holderWalletLifecycles(statsHolderRows, mint, enrichHolderLifecycle && !skipHeavy, boundedHolderLimit);
  const holderRows = holderSummary(stats as Json | null, trades, pool as Json | null, holderLifecycle);
  const positionRows = positionSummary(backend as Json | null, traderRows, snapshotPriceUsd);
  const risk = riskVerdict({ stats: stats as Json | null, pool: pool as Json | null, trades, holders: holderRows, tradeTape });
  const liveChecklist = liveReadinessChecklist({ profile: effectiveProfile, trades, holders: holderRows, tradeTape, stats: stats as Json | null, pool: pool as Json | null, holderLifecycleStatus: holderLifecycle.status });
  const paperDecision = paperTradeDecision({ mint, priceUsd: snapshotPriceUsd, tradeTape, risk });
  const paperLedger = fastPrimary ? { status: 'primary-fast-deferred', source: 'primary-fast', execution: 'paper-only-no-sign-no-send', storage: { productionDurable: null, mode: 'deferred' }, summary: { openCount: 0, closedCount: 0, totalPnlUsd: null }, note: 'Paper ledger deferred to background enrichment.' } : await readJson(origin, `/api/paper-ledger?mint=${qMint}${snapshotPriceUsd !== null ? `&currentPriceUsd=${encodeURIComponent(String(snapshotPriceUsd))}` : ''}`);
  const pumpCreator = (pumpToken as { creator?: string | null } | null)?.creator ?? null;
  const pumpDevTokens = pumpCreator && !skipHeavy ? await readJson(origin, `/api/pumpfun/dev-tokens?creator=${encodeURIComponent(pumpCreator)}&limit=50`) : { status: pumpCreator ? (prototype ? 'prototype' : fastPrimary ? 'primary-fast-deferred' : 'smoke') : 'missing-creator', source: skipHeavy ? (fastPrimary ? 'primary-fast' : 'prototype-skip') : 'pumpfun', tokens: [], note: skipHeavy ? (fastPrimary ? 'Pump.fun dev token history deferred to enrichment.' : 'Skipped during prototype scan to avoid upstream 429 pressure.') : undefined };
  const devRows = (devSold?.wallets ?? []).map((row) => ({ ...row, source: devSold?.source ?? 'helius-required' }));

  const observedAt = new Date().toISOString();
  const poolSummary = objectValue((pool as Json | null)?.summary);
  const poolSources = objectValue((pool as Json | null)?.sources);
  const marketSummary = objectValue((marketFeed as Json | null)?.summary ?? marketFeed);
  const trackerPrice = trackerObjectRecord((solanaTrackerPrice as { data?: unknown } | null)?.data);
  const trackerTokenRoot = trackerObjectRecord((solanaTrackerToken as { data?: unknown } | null)?.data);
  const trackerToken = trackerObjectRecord(trackerTokenRoot.token ?? trackerTokenRoot.data ?? trackerTokenRoot);
  const trackerPools = Array.isArray(trackerTokenRoot.pools) ? trackerTokenRoot.pools : Array.isArray(trackerToken.pools) ? trackerToken.pools : [];
  const trackerPool = trackerObjectRecord(trackerPools[0]);
  const trackerEvents = trackerObjectRecord(trackerTokenRoot.events ?? trackerToken.events);
  const trackerMarket = trackerObjectRecord(trackerTokenRoot.market ?? trackerToken.market ?? trackerPool);
  const trackerPriceUsd = trackerNumberFrom(trackerPrice.price, trackerPrice.priceUsd, trackerPrice.usd, trackerToken.price, trackerToken.priceUsd, trackerMarket.priceUsd);
  const trackerMarketCapUsd = trackerNumberFrom(trackerPrice.marketCap, trackerPrice.marketCapUsd, trackerToken.marketCap, trackerToken.marketCapUsd, trackerMarket.marketCap);
  const trackerLiquidityUsd = trackerNumberFrom(trackerToken.liquidity, trackerToken.liquidityUsd, trackerMarket.liquidity, trackerMarket.liquidityUsd, trackerPool.liquidityUsd, trackerPool.liquidity);
  const trackerVolume24hUsd = trackerNumberFrom(trackerToken.volume24h, trackerToken.volume24hUsd, trackerMarket.volume24h, trackerMarket.volume24hUsd, trackerPool.volume24h, trackerPool.volume24hUsd);
  const trackerChange24hPct = trackerNumberFrom(trackerPrice.priceChange24h, trackerPrice.priceChange24hPct, trackerPrice['24h'], trackerEvents['24h'] && trackerObjectRecord(trackerEvents['24h']).priceChangePercentage, trackerMarket.priceChange24hPct);
  const trackerStatus = String((solanaTrackerPrice as { status?: string } | null)?.status ?? (solanaTrackerToken as { status?: string } | null)?.status ?? 'unknown');
  const statsJson = stats as Json | null;
  const statsSupply = objectValue(statsJson?.supply);
  const statsConcentration = objectValue(statsJson?.concentration);
  const statsRugcheck = objectValue(statsJson?.rugcheck);
  const statsLp = objectValue(statsJson?.lpBurned);
  const statsDev = objectValue(statsJson?.devHolding);
  const chartJson = chartData as Json | null;
  const chartCandles = Array.isArray(chartJson?.candles) ? chartJson.candles : [];
  const lpJson = lpScan as Json | null;
  const lpPositionJson = lpPositions as Json | null;
  const walletGraphJson = walletGraph as Json | null;
  const lpScans = Array.isArray(lpJson?.scans) ? lpJson.scans as Json[] : [];
  const lpScanRows = lpScans.map((scan) => objectValue(scan.lpScan));
  const bestLpBurnedPct = lpScanRows.reduce<number | null>((best, scan) => {
    const value = numberOrNull(scan.burnedPct);
    return value === null ? best : best === null ? value : Math.max(best, value);
  }, null);
  const bestLpLockedPct = lpScanRows.reduce<number | null>((best, scan) => {
    const value = numberOrNull(scan.lockedPct);
    return value === null ? best : best === null ? value : Math.max(best, value);
  }, null);
  const freshSummary = objectValue((fresh as Json | null)?.summary);
  const bundleSummary = objectValue((bundles as Json | null)?.summary);
  const sniperPct = numberOrNull(freshSummary.freshPct);
  const bundledWallets = numberOrNull(bundleSummary.suspectedWallets ?? bundleSummary.walletsInSuspectedClusters ?? bundleSummary.suspectedClusterWallets);
  const classifiedWallets = numberOrNull(freshSummary.walletsClassified ?? bundleSummary.walletsClassified ?? bundleSummary.uniqueWallets);
  const bundlerPct = bundledWallets !== null && classifiedWallets && classifiedWallets > 0 ? (bundledWallets / classifiedWallets) * 100 : numberOrNull(bundleSummary.suspectedPct);
  const lpSummary = objectValue(lpJson?.summary);
  const lpModels = Array.isArray(lpSummary.lpModels) ? lpSummary.lpModels.map(String) : [];
  const primaryLpScan = lpScans.find((scan) => scan.lpMint) ?? lpScans[0] ?? {};
  const lpModel = String(primaryLpScan.lpModel ?? lpModels[0] ?? 'unknown');
  const lockBurnApplicability = String(primaryLpScan.lockBurnApplicability ?? lpSummary.lockBurnApplicability ?? 'unresolved');
  const lpScanStatus = String(primaryLpScan.lpMintStatus ?? lpJson?.status ?? 'unknown');
  const lpReason = String(primaryLpScan.reason ?? primaryLpScan.note ?? lpJson?.note ?? 'LP scan status unavailable.');
  const lpNextCredentialNeeded = typeof primaryLpScan.nextCredentialNeeded === 'string' ? primaryLpScan.nextCredentialNeeded : null;
  const insiders = objectValue(statsJson?.insiders);
  const graphInsider = objectValue(walletGraphJson?.insider);
  const graph = objectValue(walletGraphJson?.graph);
  const insiderEdges = Array.isArray(graph.edges) ? graph.edges : [];
  const insiderNetworks = numberOrNull(insiders.insiderNetworks ?? insiders.networks ?? statsRugcheck.insiderNetworks ?? statsRugcheck.graphInsidersDetected);
  const insiderWalletCount = numberOrNull(graphInsider.walletCount ?? insiders.insiderWalletCount);
  const insiderSupplyPctEstimate = numberOrNull(graphInsider.supplyPct ?? insiders.insiderSupplyPctEstimate ?? insiders.pct);
  const insiderSupplyPctCoverage = typeof graphInsider.supplyPctCoverage === 'string' ? graphInsider.supplyPctCoverage : insiderSupplyPctEstimate !== null ? 'partial-top-holder-overlap' : 'unavailable';
  const insiderConfidence = typeof graphInsider.confidence === 'string' ? graphInsider.confidence : typeof insiders.confidence === 'string' ? insiders.confidence : 'low';
  const insiderStatus = typeof walletGraphJson?.status === 'string' && walletGraphJson.status !== 'smoke' ? 'wallet-graph-indexed' : typeof insiders.insiderStatus === 'string' ? insiders.insiderStatus : typeof insiders.status === 'string' ? insiders.status : 'wallet-graph-parser-pending';
  const insiderEvidence = Array.isArray(graphInsider.evidence) ? graphInsider.evidence.map(String) : Array.isArray(insiders.evidence) ? insiders.evidence.map(String) : [];
  const insiderLimitations = Array.isArray(graphInsider.limitations) ? graphInsider.limitations.map(String) : Array.isArray(insiders.limitations) ? insiders.limitations.map(String) : ['Exact insider percentage requires a wallet graph/indexer.'];
  const lpPositionSummary = objectValue(lpPositionJson?.summary);
  const positionPools = Array.isArray(lpPositionJson?.pools) ? lpPositionJson.pools : [];
  const positionIndexStatus = String(lpPositionSummary.positionPoolsIndexed ? 'indexed' : lpPositionSummary.positionPoolsClassified ? 'classified-indexer-required' : lpPositionJson?.status ?? 'unavailable');
  const positionOwnerCount = numberOrNull(lpPositionSummary.ownerCount);
  const positionCount = numberOrNull(lpPositionSummary.positionCount);
  const positionOwnerConcentrationPctEstimate = numberOrNull(lpPositionSummary.ownerConcentrationPctEstimate);
  const positionConfidence = typeof lpPositionSummary.confidence === 'string' ? lpPositionSummary.confidence : 'low';
  const positionLimitations = Array.isArray(lpPositionSummary.limitations) ? lpPositionSummary.limitations.map(String) : [];
  const gmgnTrendingRows = extractDiscoveryRows(gmgnTrending as Json | null, 30);
  const gmgnHotRows = extractDiscoveryRows(gmgnHotSearches as Json | null, 30);
  const discoveryRows = [...gmgnTrendingRows, ...gmgnHotRows].slice(0, 40);
  const holderCoverage = {
    status: holderRows.status ?? 'unknown',
    source: holderRows.source ?? 'unknown',
    observedAt,
    latencyMs: null,
    coverageLabel: holderRows.coverageLabel ?? `${holderRows.rows?.length ?? 0} holder rows`,
    walletCountReturned: holderRows.walletCountReturned ?? holderRows.rows?.length ?? 0,
    walletLimit: holderRows.walletLimit ?? boundedHolderLimit,
    isTruncated: Boolean(holderRows.isTruncated),
    nextCursor: holderRows.nextCursor ?? null,
    paginationStatus: holderRows.paginationStatus ?? null,
    blockers: holderRows.rows?.length ? [] : [holderRows.note ?? 'Holder rows unavailable from current providers.'],
    nextCredentialNeeded: holderRows.rows?.length ? null : 'Solscan Pro, Helius DAS, Birdeye, or another holder provider for deeper coverage.'
  };
  const sourceStatus = {
    market: { status: trackerPriceUsd !== null || poolSummary.priceUsd || marketSummary.priceUsd ? 'ok' : 'partial', source: trackerPriceUsd !== null || trackerMarketCapUsd !== null || trackerLiquidityUsd !== null ? 'solana-tracker' : String(poolSummary.bestDex ?? poolSummary.dexId ?? 'pool-index'), observedAt, latencyMs: (solanaTrackerPrice as { latencyMs?: number | null } | null)?.latencyMs ?? null, blockers: trackerStatus !== 'ok' && trackerStatus !== 'unknown' ? [String((solanaTrackerPrice as { note?: string | null } | null)?.note ?? `Solana Tracker ${trackerStatus}`)] : [], nextCredentialNeeded: trackerStatus === 'not-configured' ? 'SOLANATRACKER_API_KEY for primary token intelligence.' : null },
    chart: { status: String(chartJson?.status ?? (chartCandles.length ? 'ok' : 'partial')), source: String(chartJson?.source ?? 'token-chart'), observedAt, latencyMs: null, blockers: chartCandles.length ? [] : [String(chartJson?.note ?? chartJson?.error ?? 'Chart candles unavailable from current provider.')], nextCredentialNeeded: chartCandles.length ? null : 'GeckoTerminal availability or another OHLCV provider.' },
    tradeTape: { status: String(tradeTape.status ?? (trades.length ? 'ok' : 'empty')), source: String(tradeTape.primary ?? 'token-transactions'), observedAt, latencyMs: typeof tradeTape.latencyMs === 'number' ? tradeTape.latencyMs : null, blockers: Array.isArray(tradeTape.blockers) ? tradeTape.blockers : [], nextCredentialNeeded: Array.isArray(tradeTape.optionalProviderGaps) ? tradeTape.optionalProviderGaps[0] ?? null : null },
    holders: holderCoverage,
    security: { status: statsJson ? 'partial' : 'unavailable', source: String(holderRows.source ?? 'token-stats'), observedAt, latencyMs: null, blockers: insiderLimitations, nextCredentialNeeded: insiderSupplyPctEstimate !== null ? null : 'Wallet graph parser/indexer for exact insider percentage.' },
    liquidity: { status: String(lpJson?.status ?? 'unknown'), source: String(lpJson?.source ?? 'lp-lock-burn-scanner'), observedAt, latencyMs: null, blockers: bestLpBurnedPct === null && bestLpLockedPct === null ? [lpReason] : [], nextCredentialNeeded: lpNextCredentialNeeded ?? (bestLpBurnedPct === null && bestLpLockedPct === null && lockBurnApplicability !== 'not-applicable-position-model' ? 'LP locker address list or DEX layout support.' : null), lpModel, lockBurnApplicability },
    discovery: { status: discoveryRows.length ? 'ok' : String(objectValue(gmgnTrending as Json | null).status ?? 'partial'), source: discoveryRows.length ? 'gmgn-trending+hot-searches' : 'gmgn-or-provider-pending', observedAt, latencyMs: null, blockers: discoveryRows.length ? [] : [String(objectValue(gmgnTrending as Json | null).error ?? objectValue(gmgnTrending as Json | null).note ?? 'Discovery provider not configured.')], nextCredentialNeeded: discoveryRows.length ? null : 'GMGN_API_KEY or alternate discovery feed.' },
    providerHealth: { status: String(objectValue(health).status ?? 'unknown'), source: String(objectValue(health).source ?? 'indexer-health'), observedAt, latencyMs: null, blockers: [], nextCredentialNeeded: null }
  };

  return Response.json({
    status: 'ok',
    observedAt,
    mint,
    project: project || null,
    profile: effectiveProfile,
    tokenIdentity: {
      mint,
      symbol: String(trackerToken.symbol ?? poolSummary.baseTokenSymbol ?? poolSummary.symbol ?? objectValue(pumpToken as Json | null).symbol ?? ''),
      name: String(trackerToken.name ?? poolSummary.baseTokenName ?? poolSummary.name ?? objectValue(pumpToken as Json | null).name ?? ''),
      chain: 'solana',
      launchpad: objectValue(pumpToken as Json | null).status ? 'pumpfun-or-solana-token' : null,
      socials: objectValue(pumpToken as Json | null).socials ?? null,
      sourceStatus: sourceStatus.market
    },
    pairIdentity: {
      pairAddress: poolSummary.bestPairAddress ?? poolSummary.pairAddress ?? null,
      dexId: poolSummary.bestDex ?? poolSummary.dexId ?? null,
      poolAgeSource: poolSummary.poolAgeSource ?? null,
      firstSeenAt: poolSummary.firstSeenAt ?? poolSummary.pairCreatedAt ?? null,
      migrationStatus: objectValue(objectValue(pumpToken as Json | null).migration).complete === true ? 'migrated' : objectValue(pumpToken as Json | null).status ? 'bonding-or-unknown' : 'unknown',
      sourceStatus: sourceStatus.market
    },
    market: {
      priceUsd: trackerPriceUsd ?? numberOrNull(poolSummary.priceUsd ?? marketSummary.priceUsd),
      marketCapUsd: trackerMarketCapUsd ?? numberOrNull(poolSummary.marketCap ?? poolSummary.marketCapUsd ?? poolSummary.fdv ?? marketSummary.marketCap),
      fdvUsd: numberOrNull(poolSummary.fdv ?? poolSummary.fdvUsd),
      liquidityUsd: trackerLiquidityUsd ?? numberOrNull(poolSummary.liquidityUsd ?? marketSummary.liquidityUsd),
      volume24hUsd: trackerVolume24hUsd ?? numberOrNull(poolSummary.volume24hUsd ?? poolSummary.volumeUsd24h ?? marketSummary.volume24hUsd),
      priceChange24hPct: trackerChange24hPct ?? numberOrNull(poolSummary.priceChange24hPct ?? marketSummary.priceChange24hPct),
      buys: numberOrNull(objectValue(transactions?.summary).buys),
      sells: numberOrNull(objectValue(transactions?.summary).sells),
      tradeRows: trades.length,
      sourceStatus: sourceStatus.market
    },
    chart: {
      status: String(chartJson?.status ?? (chartCandles.length ? 'ok' : 'partial')),
      source: String(chartJson?.source ?? 'token-chart'),
      frame: chartJson?.frame ?? searchParams.get('frame') ?? '5m',
      pool: chartJson?.pool ?? null,
      candles: chartCandles,
      candleCount: chartCandles.length,
      placeholderLabel: chartCandles.length ? null : 'Chart provider pending/rate-limited; market/tape/holder data remains usable.',
      sourceStatus: sourceStatus.chart
    },
    holderCoverage,
    security: {
      mintAuthority: statsRugcheck.mintAuthority ?? null,
      freezeAuthority: statsRugcheck.freezeAuthority ?? null,
      rugged: statsRugcheck.rugged ?? null,
      top10Pct: numberOrNull(statsConcentration.top10Pct),
      devPct: numberOrNull(statsDev.pct),
      lpStatus: statsLp.status ?? lpJson?.status ?? null,
      lpNote: statsLp.note ?? lpJson?.note ?? null,
      lpBurnedPct: bestLpBurnedPct,
      lpLockedPct: bestLpLockedPct,
      lpModel,
      lockBurnApplicability,
      lpScanStatus,
      positionIndexStatus,
      positionOwnerCount,
      positionCount,
      positionOwnerConcentrationPctEstimate,
      positionConfidence,
      positionLimitations,
      sniperPct,
      bundlerPct,
      insiderStatus,
      insiderNetworks,
      insiderWalletCount,
      insiderSupplyPctEstimate,
      insiderConfidence,
      insiderEvidence,
      insiderLimitations,
      insiderEdges,
      riskStatus: risk.status,
      reasons: risk.reasons,
      sourceStatus: sourceStatus.security
    },
    liquidity: {
      liquidityUsd: trackerLiquidityUsd ?? numberOrNull(poolSummary.liquidityUsd ?? marketSummary.liquidityUsd),
      pairAddress: poolSummary.bestPairAddress ?? poolSummary.pairAddress ?? null,
      dexId: poolSummary.bestDex ?? poolSummary.dexId ?? null,
      lpStatus: statsLp.status ?? lpJson?.status ?? null,
      lpModel,
      lockBurnApplicability,
      lpScanStatus,
      lpReason,
      lpNextCredentialNeeded,
      lpBurnedPct: bestLpBurnedPct,
      lpLockedPct: bestLpLockedPct,
      lpPoolsScanned: numberOrNull(lpSummary.poolsScanned),
      lpMintsResolved: numberOrNull(lpSummary.lpMintsResolved),
      positionIndexStatus,
      positionOwnerCount,
      positionCount,
      positionOwnerConcentrationPctEstimate,
      positionConfidence,
      positionLimitations,
      positionPools,
      scans: lpScans,
      sourceStatus: sourceStatus.liquidity
    },
    migration: {
      status: objectValue(objectValue(pumpToken as Json | null).migration).complete === true ? 'complete' : 'unknown-or-not-complete',
      raydiumPool: objectValue(objectValue(pumpToken as Json | null).migration).raydiumPool ?? null,
      rows: objectValue(pumpMigrations as Json | null).migrations ?? [],
      sourceStatus: { status: String(objectValue(pumpMigrations as Json | null).status ?? 'unknown'), source: 'pumpfun-migrations', observedAt, latencyMs: null, blockers: [], nextCredentialNeeded: null }
    },
    wallets: objectValue((backend as Json | null)?.wallets),
    paperTrading: { decision: paperDecision, ledger: paperLedger, execution: 'paper-only-no-sign-no-send' },
    discovery: {
      watchlist: mint ? [{ mint, symbol: String(trackerToken.symbol ?? poolSummary.baseTokenSymbol ?? poolSummary.symbol ?? ''), source: 'loaded-token', status: 'active' }] : [],
      recentTokens: mint ? [{ mint, symbol: String(trackerToken.symbol ?? poolSummary.baseTokenSymbol ?? poolSummary.symbol ?? ''), source: 'loaded-token' }, ...discoveryRows.slice(0, 8)] : discoveryRows.slice(0, 10),
      scannerRows: discoveryRows,
      scanners: [
        { key: 'gmgn-trending', label: 'Trending', status: objectValue(gmgnTrending as Json | null).status ?? 'unknown', rows: gmgnTrendingRows.length, source: 'GMGN read-only' },
        { key: 'gmgn-hot-searches', label: 'Hot searches', status: objectValue(gmgnHotSearches as Json | null).status ?? 'unknown', rows: gmgnHotRows.length, source: 'GMGN read-only' },
        { key: 'loaded-token', label: 'Loaded token', status: mint ? 'ok' : 'empty', rows: mint ? 1 : 0, source: 'local' }
      ],
      sourceStatus: sourceStatus.discovery
    },
    providerHealth: health,
    sourceStatus,
    sources: {
      health,
      pumpfun: { token: (pumpToken as Json | null)?.status ?? null, migrations: (pumpMigrations as Json | null)?.status ?? null, devTokens: (pumpDevTokens as Json | null)?.status ?? null },
      poolAge: (pool as Json | null)?.summary ? { source: ((pool as Json).summary as Json).poolAgeSource, firstSeenAt: ((pool as Json).summary as Json).firstSeenAt, bitquery: ((pool as Json).sources as Json | undefined)?.bitquery ?? null } : null,
      solanaTracker: { priceStatus: (solanaTrackerPrice as { status?: string } | null)?.status ?? null, tokenStatus: (solanaTrackerToken as { status?: string } | null)?.status ?? null, priceLatencyMs: (solanaTrackerPrice as { latencyMs?: number | null } | null)?.latencyMs ?? null, tokenLatencyMs: (solanaTrackerToken as { latencyMs?: number | null } | null)?.latencyMs ?? null, note: (solanaTrackerPrice as { note?: string | null } | null)?.note ?? (solanaTrackerToken as { note?: string | null } | null)?.note ?? null },
      tradeTape,
      holders: holderRows.source ?? null,
      holderLifecycle: { status: holderLifecycle.status, source: holderLifecycle.source, note: holderLifecycle.note, enabled: enrichHolderLifecycle && !skipHeavy, walletCountReturned: holderLifecycle.walletCountReturned, walletLimit: holderLifecycle.walletLimit, isTruncated: holderLifecycle.isTruncated, nextCursor: holderLifecycle.nextCursor, coverageLabel: holderLifecycle.coverageLabel },
      fresh: (fresh as Json | null)?.source ?? null,
      bundles: (bundles as Json | null)?.source ?? null,
      devSold: devSold?.source ?? null,
      gmgn: objectValue(gmgn).gmgn ?? null,
      chart: { status: chartJson?.status ?? null, source: chartJson?.source ?? null, candleCount: chartCandles.length },
      lpScan: { status: lpJson?.status ?? null, source: lpJson?.source ?? null, burnedPct: bestLpBurnedPct, lockedPct: bestLpLockedPct },
      lpPositions: { status: lpPositionJson?.status ?? null, source: lpPositionJson?.source ?? null, positionIndexStatus, positionPools: positionPools.length },
      walletGraph: { status: walletGraphJson?.status ?? null, source: walletGraphJson?.source ?? null, edges: insiderEdges.length, coverage: insiderSupplyPctCoverage },
      discovery: sourceStatus.discovery
    },
    gmgn,
    providerEnvAudit,
    pool,
    marketFeed,
    holders: holderRows,
    tradeTape,
    trades: { rows: trades, topTraders: traderRows, summary: transactions?.summary ?? null, fallbackSource: transactions?.fallbackSource ?? null, tradeTape },
    freshWallets: fresh,
    snipers: fresh,
    bundles,
    devTokens: { classifier: devSold, wallets: devRows, pumpfun: pumpDevTokens },
    pumpfun: { token: pumpToken, migrations: pumpMigrations, devTokens: pumpDevTokens },
    terminal: backend,
    positions: positionRows,
    riskVerdict: risk,
    liveReadiness: liveChecklist,
    paperTradeDecision: paperDecision,
    paperLedger,
    orders: ((backend as Json | null)?.execution as Json | undefined)?.terminalOrders ?? null,
    execution: 'terminal-token-snapshot-read'
  });
}
