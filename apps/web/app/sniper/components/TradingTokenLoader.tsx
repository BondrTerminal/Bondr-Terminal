'use client';

import { useEffect, useState } from 'react';

type TradingTokenIntel = {
  mint: string;
  pairCount: number;
  bestPair: null | {
    dex?: string;
    pairAddress?: string;
    url?: string;
    base?: { symbol?: string; name?: string; address?: string };
    quote?: { symbol?: string; name?: string; address?: string };
    priceUsd?: string;
    liquidityUsd: number;
    volume24h: number;
    txns?: { h24?: { buys?: number; sells?: number }; h6?: { buys?: number; sells?: number }; h1?: { buys?: number; sells?: number }; m5?: { buys?: number; sells?: number } } | null;
    marketCap: number | null;
    fdv: number | null;
    pairCreatedAt?: number | null;
  };
  pairs: Array<{ dex?: string; pairAddress?: string; base?: string; quote?: string; liquidityUsd: number; volume24h: number; txns?: { h24?: { buys?: number; sells?: number }; h6?: { buys?: number; sells?: number }; h1?: { buys?: number; sells?: number }; m5?: { buys?: number; sells?: number } } | null; url?: string }>;
  riskFlags: string[];
};

type TokenTerminalStats = {
  holders?: { tokenAccountCount: number | null; totalHolders?: number | null; status: string; note: string; source?: string; rows?: HolderIntelRow[] };
  concentration?: { top10Pct: number | null; largestOwners: Array<{ owner: string | null; amount: number; pct: number | null }> };
  devHolding?: { pct: number | null; amount: number; status: string; note: string };
  snipers?: { pct: number | null; status: string; note: string };
  bundlers?: { pct: number | null; status: string; note: string };
  insiders?: { pct: number | null; networks?: number | null; status: string; note: string };
  lpBurned?: { pct: number | null; lockerScanStatus?: string | null; totalLPProviders?: number | null; status: string; note: string };
};

type TokenMarketFeed = {
  observedAt: string;
  sources: {
    dexscreener?: { status: string; pairCount: number };
    jupiter?: { status: string; routeLabels: string[]; priceImpactPct: string | null; outAmount: string | null; note?: string };
    raydium?: { status: string; pairCount: number };
    pumpswap?: { status: string; pairCount: number };
  };
  transactions: { m5: { buys: number; sells: number }; h1: { buys: number; sells: number }; h6: { buys: number; sells: number }; h24: { buys: number; sells: number } };
  venues: string[];
};

type TokenTrade = {
  side: string;
  txHash: string | null;
  wallet: string | null;
  amount: string | null;
  priceUsd: string | null;
  volumeUsd: string | null;
  timestamp: string | null;
};

type BundleIndex = { summary?: { sampledTransactions?: number; suspectedClusters?: number } };
type FreshWalletIndex = { summary?: { walletsClassified?: number; freshCount?: number; freshPct?: number | null; tradeRows?: number } };
type DevSoldIndex = { summary?: { walletsWithOutgoingTransfers?: number; totalOutgoingAmount?: number } };
type LpLockBurnIndex = { summary?: { poolsScanned?: number; lpMintsResolved?: number }; scans?: Array<{ lpScan?: { burnedPct?: number | null; lockedPct?: number | null } | { error?: string } | null }> };

type HolderIntelRow = {
  rank?: number | null;
  tokenAccount: string;
  owner: string | null;
  uiAmount: number;
  pctSupply?: number | null;
  pct?: number | null;
  valueUsd?: number | null;
  boughtTokens?: number | null;
  soldTokens?: number | null;
  avgEntryUsd?: number | null;
  avgExitUsd?: number | null;
  totalPnlUsd?: number | null;
  pnlStatus?: string | null;
  ownerSolBalance?: number | null;
  entryAt?: string | null;
  exitAt?: string | null;
  lifecycleStatus?: string | null;
  lifecycleSource?: string | null;
  lastSeenAt?: string | null;
  tags?: string[];
};

type TerminalSnapshotLite = {
  holders?: { rows?: HolderIntelRow[]; source?: string; status?: string; note?: string; totalHolders?: number | null; uniqueOwnerCount?: number | null; tokenAccountCount?: number | null };
};

function formatUsd(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString()}`;
}

function formatAge(pairCreatedAt?: number | null) {
  if (!pairCreatedAt) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - pairCreatedAt) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function volumeToLiquidity(volume24h?: number, liquidityUsd?: number) {
  if (!volume24h || !liquidityUsd) return '—';
  return `${(volume24h / liquidityUsd).toFixed(2)}x`;
}

function formatPct(value: number | null | undefined, fallback = 'API limited') {
  return typeof value === 'number' ? `${value.toFixed(2)}%` : fallback;
}

function formatCount(value: number | null | undefined, fallback = 'API limited') {
  return typeof value === 'number' ? value.toLocaleString() : fallback;
}


function compactAddress(address: string | null | undefined) {
  return address ? `${address.slice(0, 6)}…${address.slice(-5)}` : '—';
}

function formatTokenAmount(value: number | null | undefined, fallback = '—') {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: value >= 1000 ? 0 : 4 }) : fallback;
}

function formatDateTime(value: string | null | undefined, fallback = '—') {
  return value ? new Date(value).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : fallback;
}

function formatPriceOrTime(price: number | null | undefined, timestamp: string | null | undefined, fallback = '—') {
  if (typeof price === 'number' && Number.isFinite(price)) return formatUsd(price);
  return formatDateTime(timestamp, fallback);
}

function holderTradeLabel(row: HolderIntelRow) {
  if (row.pnlStatus === 'trade-tape-estimate') return 'Matched trade history';
  if (row.lifecycleStatus === 'not-configured') return 'Need Helius';
  if (row.lifecycleStatus === 'empty') return 'No sampled flow';
  if (row.boughtTokens || row.soldTokens) return 'Partial trade history';
  return 'Balance only';
}

function holderSourceLabel(source?: string) {
  if (!source) return 'Holder index';
  if (source.includes('solscan')) return 'Solscan';
  if (source.includes('helius')) return 'Helius';
  if (source.includes('rugcheck')) return 'RugCheck';
  if (source.includes('pumpfun')) return 'Pump.fun';
  if (source.includes('rpc')) return 'RPC';
  return source;
}

function HolderWalletTable({ rows, source, status, note }: { rows: HolderIntelRow[]; source?: string; status?: string; note?: string }) {
  return <div className="holderWalletCluster">
    <div className="holderWalletMeta"><span>{holderSourceLabel(source)}</span><small>{rows.length ? `${rows.length} ranked wallet rows` : note ?? status ?? 'Loading holder rows'}</small></div>
    <div className="terminalDataTable tokenLoaderHolderTable holderIntelTable" role="table" aria-label="Token holder wallet list">
      <div className="terminalDataRow terminalDataHead" role="row"><span>#</span><span>Wallet</span><span>SOL</span><span>Holding</span><span>Supply</span><span>Value</span><span>Trade history</span><span>Entry</span><span>Exit</span><span>PnL</span><span>Source</span></div>
      {rows.slice(0, 25).map((row, index) => {
        const pct = row.pctSupply ?? row.pct ?? null;
        const pnlClass = typeof row.totalPnlUsd === 'number' ? row.totalPnlUsd >= 0 ? 'positivePnlCell' : 'negativePnlCell' : '';
        const tradeMatched = row.pnlStatus === 'trade-tape-estimate';
        return <div className="terminalDataRow holderIntelRow" role="row" key={`${row.tokenAccount}-${index}`}>
          <span>{row.rank ?? index + 1}</span>
          <strong><a href={row.owner ? `https://solscan.io/account/${row.owner}` : '#'} target="_blank" rel="noreferrer">{compactAddress(row.owner)}</a><small>{compactAddress(row.tokenAccount)}</small></strong>
          <span>{typeof row.ownerSolBalance === 'number' ? `${row.ownerSolBalance.toFixed(3)} SOL` : '—'}</span>
          <span>{formatTokenAmount(row.uiAmount)}</span>
          <span>{formatPct(pct, '—')}</span>
          <span>{formatUsd(row.valueUsd)}</span>
          <span className={tradeMatched ? 'holderStatusMatched' : 'holderStatusBalance'}>{holderTradeLabel(row)}</span>
          <span>{formatPriceOrTime(row.avgEntryUsd, row.entryAt)}</span>
          <span>{formatPriceOrTime(row.avgExitUsd, row.exitAt)}</span>
          <span className={pnlClass}>{formatUsd(row.totalPnlUsd)}</span>
          <span>{holderSourceLabel(row.lifecycleSource ?? source)}</span>
        </div>;
      })}
      {rows.length === 0 && <div className="terminalDataRow" role="row"><strong>No holder rows loaded</strong><span>{holderSourceLabel(source)}</span><span>{note ?? 'No ranked wallet rows loaded yet.'}</span><span>—</span></div>}
    </div>
  </div>;
}

function txnRatio(buys?: number, sells?: number) {
  const total = (buys ?? 0) + (sells ?? 0);
  if (!total) return 'No txs';
  return `${Math.round(((buys ?? 0) / total) * 100)}% buy`;
}

export function TradingTokenLoader({ defaultMint = '', devWallets = [] }: { defaultMint?: string; devWallets?: string[] }) {
  const [mint, setMint] = useState(defaultMint);
  const [intel, setIntel] = useState<TradingTokenIntel | null>(null);
  const [stats, setStats] = useState<TokenTerminalStats | null>(null);
  const [marketFeed, setMarketFeed] = useState<TokenMarketFeed | null>(null);
  const [trades, setTrades] = useState<TokenTrade[]>([]);
  const [bundleIndex, setBundleIndex] = useState<BundleIndex | null>(null);
  const [freshIndex, setFreshIndex] = useState<FreshWalletIndex | null>(null);
  const [devSoldIndex, setDevSoldIndex] = useState<DevSoldIndex | null>(null);
  const [lpIndex, setLpIndex] = useState<LpLockBurnIndex | null>(null);
  const [terminalSnapshot, setTerminalSnapshot] = useState<TerminalSnapshotLite | null>(null);
  const [tradeSource, setTradeSource] = useState('loading');
  const [chartMetric, setChartMetric] = useState<'Price' | 'MCap' | 'Liquidity'>('Price');
  const [copiedMint, setCopiedMint] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadToken() {
    setLoading(true);
    setError('');
    setIntel(null);
    setStats(null);
    setMarketFeed(null);
    setTrades([]);
    setBundleIndex(null);
    setFreshIndex(null);
    setDevSoldIndex(null);
    setLpIndex(null);
    setTerminalSnapshot(null);
    setTradeSource('loading');
    try {
      const intelResponse = await fetch(`/api/token-intel?mint=${encodeURIComponent(mint)}`);
      const data = await intelResponse.json();
      if (!intelResponse.ok) throw new Error(data.error ?? 'Token lookup failed.');
      setIntel(data as TradingTokenIntel);
      window.dispatchEvent(new CustomEvent('meridian-token-loaded', {
        detail: {
          mint,
          name: data.bestPair?.base?.name,
          symbol: data.bestPair?.base?.symbol
        }
      }));
      void fetch(`/api/terminal/snapshot?mint=${encodeURIComponent(mint)}&holderLimit=25&limit=30&profile=prototype&devWallets=${encodeURIComponent(devWallets.join(','))}`)
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          setTerminalSnapshot(payload as TerminalSnapshotLite | null);
          setStats((payload?.holders || payload?.normalized?.holders?.data || null) ? payload as TokenTerminalStats : null);
          setMarketFeed((payload?.marketFeed ?? payload?.normalized?.marketFeed?.data ?? null) as TokenMarketFeed | null);
          setTrades((payload?.trades?.rows ?? payload?.normalized?.transactionTape?.rows ?? []) as TokenTrade[]);
          setTradeSource(payload?.trades?.sources?.trades?.primary ?? payload?.sources?.tradeTape?.primary ?? payload?.sources?.tradeTape?.source ?? payload?.trades?.fallbackSource ?? payload?.normalized?.transactionTape?.source ?? 'unavailable');
          setBundleIndex((payload?.bundles ?? payload?.normalized?.risk?.data?.bundles ?? null) as BundleIndex | null);
          setFreshIndex((payload?.freshWallets ?? payload?.normalized?.risk?.data?.freshWallets ?? null) as FreshWalletIndex | null);
          setDevSoldIndex((payload?.devTokens?.classifier ?? payload?.normalized?.risk?.data?.devTokens?.classifier ?? null) as DevSoldIndex | null);
          setLpIndex((payload?.terminal?.lp ?? null) as LpLockBurnIndex | null);
        })
        .catch(() => {
          setTerminalSnapshot(null);
          setStats(null);
          setMarketFeed(null);
          setTrades([]);
          setTradeSource('unavailable');
          setBundleIndex(null);
          setFreshIndex(null);
          setDevSoldIndex(null);
          setLpIndex(null);
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token lookup failed.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!defaultMint) return;
    void loadToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultMint]);

  const chartUrl = intel?.bestPair?.pairAddress
    ? `https://dexscreener.com/solana/${intel.bestPair.pairAddress}?embed=1&theme=dark&trades=0&info=0`
    : '';
  const baseSymbol = intel?.bestPair?.base?.symbol ?? 'TOKEN';
  const quoteSymbol = intel?.bestPair?.quote?.symbol ?? 'SOL';
  const liveTradeLabel = tradeSource === 'helius' ? 'Helius live' : tradeSource === 'birdeye' ? 'Birdeye live' : tradeSource === 'geckoterminal' ? 'Gecko live' : 'Trade feed';
  const freshValue = freshIndex?.summary ? `${freshIndex.summary.freshCount ?? 0}/${freshIndex.summary.walletsClassified ?? 0}` : 'Loading';
  const freshPct = freshIndex?.summary?.freshPct ?? null;
  const bestLpScan = lpIndex?.scans?.find((scan) => scan.lpScan && !('error' in scan.lpScan));
  const bestLpData = bestLpScan?.lpScan && !('error' in bestLpScan.lpScan) ? bestLpScan.lpScan as { burnedPct?: number | null; lockedPct?: number | null } : null;
  const holderRows = terminalSnapshot?.holders?.rows ?? stats?.holders?.rows ?? [];
  const holderSource = terminalSnapshot?.holders?.source ?? stats?.holders?.source ?? stats?.holders?.status ?? 'loading';
  const valuedHolderRows = holderRows.filter((row) => typeof row.valueUsd === 'number').length;
  const tradeMatchedHolderRows = holderRows.filter((row) => row.pnlStatus === 'trade-tape-estimate').length;
  const marketSources = marketFeed?.sources ?? {};
  const marketTransactions = marketFeed?.transactions ?? { m5: { buys: 0, sells: 0 }, h1: { buys: 0, sells: 0 }, h6: { buys: 0, sells: 0 }, h24: { buys: 0, sells: 0 } };
  const jupiterRouteLabels = marketSources.jupiter?.routeLabels ?? [];

  async function copyMint() {
    if (!intel?.mint) return;
    await navigator.clipboard.writeText(intel.mint);
    setCopiedMint(true);
    window.setTimeout(() => setCopiedMint(false), 1_500);
  }

  return (
    <section className="tradingTokenLoader premiumTokenLoader">
      <div className="terminalPaneTitle chartTitleRow">
        <span>01</span>
        <strong>Token + chart</strong>
        <div className="chartModeChips">{(['Price', 'MCap', 'Liquidity'] as const).map((metric) => <button type="button" className={chartMetric === metric ? 'activeChartMetric' : ''} onClick={() => setChartMetric(metric)} key={metric}>{metric}</button>)}</div>
      </div>
      <div className="terminalTokenInput premiumTokenInput">
        <input placeholder="Paste token mint / contract" value={mint} onChange={(event) => setMint(event.target.value)} />
        <button type="button" onClick={loadToken} disabled={!mint || loading}>{loading ? 'Loading…' : 'Load token'}</button>
      </div>
      {error && <p className="dangerText">{error}</p>}
      {!intel && !error && <div className="emptyChartState">Load a token to view chart, liquidity, holders, and execution context.</div>}
      {intel && (
        <div className="tradingTokenContent premiumTokenContent">
          <div className="premiumTokenHeader">
            <div className="tokenIdentityBlock">
              <span>Selected pair</span>
              <strong>{baseSymbol} / {quoteSymbol}</strong>
              <small>{intel.bestPair?.base?.name ?? 'Unknown token'} · {intel.mint}</small>
            </div>
            <div className="tokenHeaderActions">
              <button type="button" onClick={copyMint}>{copiedMint ? 'Copied' : 'Copy mint'}</button>
              {intel.bestPair?.url && <a href={intel.bestPair.url} target="_blank" rel="noreferrer">Open DEX</a>}
              <a href={`https://solscan.io/token/${intel.mint}`} target="_blank" rel="noreferrer">Solscan</a>
            </div>
          </div>

          <div className="premiumTokenStats">
            <div><span>Price</span><strong>{intel.bestPair?.priceUsd ? `$${intel.bestPair.priceUsd}` : '—'}</strong></div>
            <div><span>Market cap</span><strong>{formatUsd(intel.bestPair?.marketCap ?? intel.bestPair?.fdv)}</strong></div>
            <div><span>Liquidity</span><strong>{formatUsd(intel.bestPair?.liquidityUsd)}</strong></div>
            <div><span>24h volume</span><strong>{formatUsd(intel.bestPair?.volume24h)}</strong></div>
            <div><span>Pool age</span><strong>{formatAge(intel.bestPair?.pairCreatedAt)}</strong></div>
            <div><span>Pairs</span><strong>{intel.pairCount}</strong></div>
            <div><span>Holders</span><strong>{holderRows.length ? holderRows.length : stats?.holders?.totalHolders ?? stats?.holders?.tokenAccountCount ?? '—'}</strong><small>{holderSource}</small></div>
            <div><span>Holder coverage</span><strong>{valuedHolderRows}/{holderRows.length || 0}</strong><small>{tradeMatchedHolderRows} trade-history matches</small></div>
          </div>

          <div className="chartToolbar">
            {['1m', '5m', '15m', '1h', '4h', '1d'].map((frame) => <a className="chartFrameLink" href={`/api/token-chart?mint=${intel.mint}&frame=${frame}`} target="_blank" rel="noreferrer" key={frame}>{frame}</a>)}
            <span>{marketSources.jupiter?.status === 'ok' ? `Route · ${jupiterRouteLabels.slice(0, 2).join(' / ') || 'route'}` : `${intel.bestPair?.dex ?? 'DEX'} route`}</span>
          </div>

          <div className="chartAndTapeGrid">
            <div className="dexChartFrame premiumDexChart">
              {chartUrl ? <iframe title="DEX chart" src={chartUrl} loading="lazy" /> : <div>No DEX chart available for this token yet.</div>}
            </div>
            <aside className="transactionTapePanel" aria-label="Transaction tape">
              <div className="transactionTapeHeader"><span>Transactions</span><strong>{liveTradeLabel}</strong></div>
              <div className="feedSourceGrid">
                <div><span>Jupiter</span><strong>{marketSources.jupiter?.status ?? 'loading'}</strong></div>
                <div><span>Raydium</span><strong>{marketSources.raydium?.status ?? 'loading'}</strong></div>
                <div><span>PumpSwap</span><strong>{marketSources.pumpswap?.status ?? 'loading'}</strong></div>
              </div>
              <div className="transactionTapeStats">
                <div><span>5m</span><strong>{(marketTransactions.m5?.buys ?? intel.bestPair?.txns?.m5?.buys ?? 0).toLocaleString()} / {(marketTransactions.m5?.sells ?? intel.bestPair?.txns?.m5?.sells ?? 0).toLocaleString()}</strong><small>buys / sells</small></div>
                <div><span>1h</span><strong>{(marketTransactions.h1?.buys ?? intel.bestPair?.txns?.h1?.buys ?? 0).toLocaleString()} / {(marketTransactions.h1?.sells ?? intel.bestPair?.txns?.h1?.sells ?? 0).toLocaleString()}</strong><small>{txnRatio(marketTransactions.h1?.buys ?? intel.bestPair?.txns?.h1?.buys, marketTransactions.h1?.sells ?? intel.bestPair?.txns?.h1?.sells)}</small></div>
                <div><span>24h</span><strong>{(marketTransactions.h24?.buys ?? intel.bestPair?.txns?.h24?.buys ?? 0).toLocaleString()} / {(marketTransactions.h24?.sells ?? intel.bestPair?.txns?.h24?.sells ?? 0).toLocaleString()}</strong><small>{txnRatio(marketTransactions.h24?.buys ?? intel.bestPair?.txns?.h24?.buys, marketTransactions.h24?.sells ?? intel.bestPair?.txns?.h24?.sells)}</small></div>
              </div>
              <div className="transactionTapeList">
                {trades.slice(0, 14).map((trade, index) => (
                  <a href={trade.txHash ? `https://solscan.io/tx/${trade.txHash}` : '#'} target="_blank" rel="noreferrer" className={`transactionTapeTrade ${trade.side === 'buy' ? 'buyTrade' : trade.side === 'sell' ? 'sellTrade' : ''}`} key={`${trade.txHash}-${index}`}>
                    <strong>{(trade.side || 'unknown').toUpperCase()}</strong>
                    <span>{trade.volumeUsd ? `$${Number(trade.volumeUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'volume —'}</span>
                    <small>{trade.wallet ? `${trade.wallet.slice(0, 4)}…${trade.wallet.slice(-4)}` : 'wallet —'} · {trade.priceUsd ? `$${Number(trade.priceUsd).toPrecision(4)}` : 'price —'}</small>
                  </a>
                ))}
                {trades.length === 0 && <div><strong>Trade tape</strong><span>Loading</span><small>No trades loaded for this token yet.</small></div>}
              </div>
            </aside>
          </div>

          <div className="terminalPairStrip premiumPairStrip">
            {intel.pairs.slice(0, 6).map((pair, index) => (
              <a href={pair.url ?? '#'} target="_blank" rel="noreferrer" key={`${pair.dex}-${pair.pairAddress}-${index}`}>
                <strong>{pair.dex ?? 'DEX'}</strong>
                <span>{pair.base ?? '?'} / {pair.quote ?? '?'}</span>
                <small>{formatUsd(pair.liquidityUsd)} liq · {formatUsd(pair.volume24h)} vol</small>
              </a>
            ))}
          </div>

          <HolderWalletTable rows={holderRows} source={holderSource} status={terminalSnapshot?.holders?.status ?? stats?.holders?.status} note={terminalSnapshot?.holders?.note ?? stats?.holders?.note} />
        </div>
      )}
    </section>
  );
}
