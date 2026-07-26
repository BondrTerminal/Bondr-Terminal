export const dynamic = 'force-dynamic';

import { getHeliusApiKey } from '../../../lib/solana-rpc';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type Json = Record<string, unknown>;
type TradeRow = { wallet?: string | null; side?: string; volumeUsd?: number | string | null; priceUsd?: number | string | null; txHash?: string | null; timestamp?: string | null; amount?: number | string | null; source?: string };
type HolderRow = { owner?: string | null; tokenAccount?: string; uiAmount?: number; rawAmount?: string; decimals?: number | null; pct?: number | null; pctSupply?: number | null; ownerSolBalance?: number | null; ownerBalanceStatus?: string | null; rank?: number | null };
type DevWalletRow = { wallet?: string; soldLikely?: boolean; outgoingAmount?: number; providerStatus?: string; providerNote?: string };
type TokenBalanceRow = { address?: string | null; role?: string | null; uiAmount?: number | null };
type HeliusWalletTx = { signature?: string; timestamp?: number; feePayer?: string; tokenTransfers?: Array<{ mint?: string; tokenAmount?: number; fromUserAccount?: string; toUserAccount?: string }> };
type WalletLifecycle = { wallet: string; boughtTokens: number; soldTokens: number; txCount: number; firstEntryAt: string | null; lastExitAt: string | null; lastSeenAt: string | null; signatures: string[]; source: string; status: string; note: string | null };

function objectValue(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

async function readJson<T = Json>(origin: string, path: string): Promise<T | null> {
  try {
    const response = await fetch(`${origin}${path}`, { cache: 'no-store' });
    if (!response.ok) return await response.json().catch(() => ({ status: 'error', httpStatus: response.status, error: response.statusText })) as T;
    return await response.json() as T;
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : 'fetch failed' } as T;
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

async function holderWalletLifecycles(holders: HolderRow[], mint: string, enabled: boolean) {
  const owners = Array.from(new Set(holders.map((row) => row.owner).filter((owner): owner is string => typeof owner === 'string' && ADDRESS_RE.test(owner)))).slice(0, enabled ? 20 : 0);
  if (!owners.length) return { rows: new Map<string, WalletLifecycle>(), status: enabled ? 'empty' : 'disabled', source: 'helius-wallet-history', note: enabled ? 'No holder owner wallets available for lifecycle enrichment.' : 'Holder wallet lifecycle enrichment disabled for smoke mode.' };
  const rows = await Promise.all(owners.map((owner) => fetchHeliusWalletLifecycle(owner, mint, 100)));
  return {
    rows: new Map(rows.map((row) => [row.wallet, row])),
    status: rows.some((row) => row.status === 'ok') ? 'ok' : rows.some((row) => row.status === 'not-configured') ? 'not-configured' : 'limited',
    source: 'helius-wallet-history',
    note: rows.find((row) => row.note)?.note ?? null
  };
}

function holderSummary(stats: Json | null, trades: TradeRow[], pool: Json | null, lifecycle: Awaited<ReturnType<typeof holderWalletLifecycles>>) {
  const holders = (stats?.holders ?? {}) as { rows?: HolderRow[]; totalHolders?: number | null; uniqueOwnerCount?: number | null; tokenAccountCount?: number | null; source?: string; status?: string; note?: string };
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
    const wallet = row.address ?? '';
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
      lastSeenAt: trader?.lastSeenAt ?? null,
      source: ['wallet-token-balances', priceUsd !== null ? 'dexscreener-price' : null, trader ? 'trade-tape' : null].filter((value): value is string => Boolean(value)),
      status: trader ? 'trade-tape-estimate' : amount > 0 ? 'balance-value-only' : 'empty-wallet'
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
  const skipHeavy = smoke || prototype;
  if (!mint || !ADDRESS_RE.test(mint)) return Response.json({ error: 'Missing or invalid mint.' }, { status: 400 });

  const devWallets = searchParams.get('devWallets')?.trim() ?? '';
  const qMint = encodeURIComponent(mint);
  const projectParam = project ? `&project=${encodeURIComponent(project)}` : '';
  const devParam = devWallets ? `&devWallets=${encodeURIComponent(devWallets)}` : '';

  const effectiveProfile = smoke ? 'smoke' : prototype ? 'prototype' : liveRead ? 'live-read' : 'standard';
  const boundedLimit = Math.min(Math.max(limit, 1), smoke ? 10 : prototype ? 30 : liveRead ? 50 : 100);
  const boundedHolderLimit = Math.min(Math.max(holderLimit, 1), smoke ? 1 : prototype ? 25 : liveRead ? 50 : 250);
  const [health, pool, marketFeed, pumpToken, stats, transactions, fresh, bundles, devSold, pumpMigrations, backend, providerEnvAudit] = await Promise.all([
    skipHeavy ? Promise.resolve({ status: prototype ? 'prototype' : 'smoke', source: 'prototype-skip', note: 'Skipped provider health probe during prototype scan to avoid upstream 429 pressure.' }) : readJson(origin, '/api/indexer-health'),
    readJson(origin, `/api/token-pool-index?mint=${qMint}`),
    readJson(origin, `/api/token-market-feed?mint=${qMint}`),
    readJson(origin, `/api/pumpfun/token?mint=${qMint}`),
    smoke ? Promise.resolve({ status: 'smoke', source: 'contract-smoke', holders: { rows: [], tokenAccountCount: null, nonZeroTokenAccounts: null, uniqueOwnerCount: null, totalHolders: null, status: 'smoke', source: 'contract-smoke', note: 'Smoke mode skips heavy RPC holder scan.' } }) : readJson(origin, `/api/token-stats?mint=${qMint}&holderListLimit=${boundedHolderLimit}${prototype ? '&profile=prototype' : ''}${devParam}`),
    skipHeavy ? Promise.resolve({ status: prototype ? 'prototype' : 'smoke', source: 'prototype-skip', trades: [], sources: { trades: { primary: 'prototype-skip' } }, summary: { tradeRows: 0 }, fallbackSource: null, tradeTape: { status: prototype ? 'prototype' : 'smoke', primary: 'prototype-skip', rows: 0, blockers: [], optionalProviderGaps: [], latencyMs: null, note: 'Skipped during prototype scan to avoid upstream 429 pressure.' } }) : readJson<{ trades?: TradeRow[]; sources?: Json; summary?: Json; fallbackSource?: string | null; status?: string; tradeTape?: Json }>(origin, `/api/token-transactions?mint=${qMint}&limit=${boundedLimit}`),
    skipHeavy ? Promise.resolve({ status: prototype ? 'prototype' : 'smoke', source: 'prototype-skip', rows: [], summary: { tradeRows: 0, walletsClassified: 0, freshCount: 0, freshPct: null }, note: 'Skipped during prototype scan to avoid upstream 429 pressure.' }) : readJson(origin, `/api/fresh-wallet-classifier?mint=${qMint}&limit=${boundedLimit}`),
    skipHeavy ? Promise.resolve({ status: prototype ? 'prototype' : 'smoke', source: 'prototype-skip', clusters: [], summary: { sampledTransactions: 0, suspectedClusters: 0 }, note: 'Skipped during prototype scan to avoid upstream 429 pressure.' }) : readJson(origin, `/api/bundle-clustering-index?mint=${qMint}&limit=${boundedLimit}`),
    skipHeavy ? Promise.resolve({ status: prototype ? 'prototype' : 'smoke', source: 'prototype-skip', wallets: [], summary: { walletsWithOutgoingTransfers: 0, totalOutgoingAmount: 0, totalIncomingAmount: 0 }, note: 'Skipped during prototype scan to avoid upstream 429 pressure.' }) : readJson<{ wallets?: DevWalletRow[]; summary?: Json; source?: string }>(origin, `/api/dev-sold-classifier?mint=${qMint}${devParam}&limit=${boundedLimit}`),
    skipHeavy ? Promise.resolve({ status: prototype ? 'prototype' : 'smoke', source: 'prototype-skip', migrations: [], note: 'Skipped during prototype scan to avoid upstream 429 pressure.' }) : readJson(origin, `/api/pumpfun/migrations?limit=50`),
    skipHeavy ? Promise.resolve({ status: prototype ? 'prototype' : 'smoke', execution: { terminalOrders: { orders: [], execution: 'prototype-skip' }, bundleSequencer: { execution: 'prototype-skip' }, orderEngine: {} }, wallets: { rows: [], tokenBalances: { rows: [] } }, note: 'Skipped during prototype scan to keep scanner responsive.' }) : readJson(origin, `/api/terminal-backend?mint=${qMint}${projectParam}`),
    skipHeavy ? Promise.resolve({ status: prototype ? 'prototype' : 'smoke', source: 'prototype-skip', providers: {}, note: 'Skipped provider env audit during prototype scan.' }) : readJson(origin, '/api/terminal/provider-env-audit')
  ]);

  const trades = transactions?.trades ?? [];
  const transactionSources = objectValue(transactions?.sources);
  const transactionTradeSource = objectValue(transactionSources.trades);
  const tradeTape = (transactions as { tradeTape?: Json } | null)?.tradeTape ?? { status: trades.length ? 'ok' : 'empty', primary: typeof transactionTradeSource.primary === 'string' ? transactionTradeSource.primary : 'unknown', rows: trades.length, blockers: [], optionalProviderGaps: [], latencyMs: null, note: trades.length ? null : 'No recent trade rows from current providers. Add Helius/Birdeye or load a more active token.' };
  const snapshotPriceUsd = numberOrNull(((pool as Json | null)?.summary as Json | undefined)?.priceUsd);
  const traderRows = topTraders(trades, snapshotPriceUsd);
  const statsHolderRows = (((stats as Json | null)?.holders as Json | undefined)?.rows ?? []) as HolderRow[];
  const holderLifecycle = await holderWalletLifecycles(statsHolderRows, mint, !skipHeavy);
  const holderRows = holderSummary(stats as Json | null, trades, pool as Json | null, holderLifecycle);
  const positionRows = positionSummary(backend as Json | null, traderRows, snapshotPriceUsd);
  const risk = riskVerdict({ stats: stats as Json | null, pool: pool as Json | null, trades, holders: holderRows, tradeTape });
  const liveChecklist = liveReadinessChecklist({ profile: effectiveProfile, trades, holders: holderRows, tradeTape, stats: stats as Json | null, pool: pool as Json | null, holderLifecycleStatus: holderLifecycle.status });
  const paperDecision = paperTradeDecision({ mint, priceUsd: snapshotPriceUsd, tradeTape, risk });
  const paperLedger = await readJson(origin, `/api/paper-ledger?mint=${qMint}${snapshotPriceUsd !== null ? `&currentPriceUsd=${encodeURIComponent(String(snapshotPriceUsd))}` : ''}`);
  const pumpCreator = (pumpToken as { creator?: string | null } | null)?.creator ?? null;
  const pumpDevTokens = pumpCreator && !skipHeavy ? await readJson(origin, `/api/pumpfun/dev-tokens?creator=${encodeURIComponent(pumpCreator)}&limit=50`) : { status: pumpCreator ? (prototype ? 'prototype' : 'smoke') : 'missing-creator', source: skipHeavy ? 'prototype-skip' : 'pumpfun', tokens: [], note: skipHeavy ? 'Skipped during prototype scan to avoid upstream 429 pressure.' : undefined };
  const devRows = (devSold?.wallets ?? []).map((row) => ({ ...row, source: devSold?.source ?? 'helius-required' }));

  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    mint,
    project: project || null,
    profile: effectiveProfile,
    sources: {
      health,
      pumpfun: { token: (pumpToken as Json | null)?.status ?? null, migrations: (pumpMigrations as Json | null)?.status ?? null, devTokens: (pumpDevTokens as Json | null)?.status ?? null },
      poolAge: (pool as Json | null)?.summary ? { source: ((pool as Json).summary as Json).poolAgeSource, firstSeenAt: ((pool as Json).summary as Json).firstSeenAt, bitquery: ((pool as Json).sources as Json | undefined)?.bitquery ?? null } : null,
      tradeTape,
      holders: holderRows.source ?? null,
      holderLifecycle: { status: holderLifecycle.status, source: holderLifecycle.source, note: holderLifecycle.note },
      fresh: (fresh as Json | null)?.source ?? null,
      bundles: (bundles as Json | null)?.source ?? null,
      devSold: devSold?.source ?? null
    },
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
