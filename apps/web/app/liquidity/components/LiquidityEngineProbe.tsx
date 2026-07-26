'use client';

import { useState } from 'react';

type PoolIndex = { summary?: { pairCount?: number; liquidityUsd?: number; volume24h?: number; venues?: string[]; bestDex?: string | null; bestPairAddress?: string | null; poolAgeSource?: string | null; firstSeenAt?: string | null }; pairs?: Array<{ dex?: string | null; pairAddress?: string | null; liquidityUsd?: number; volume24h?: number; priceUsd?: string | number | null; marketCap?: number | null; fdv?: number | null; url?: string | null }> };
type LpScan = { summary?: { poolsScanned?: number; lpMintsResolved?: number; unresolvedPools?: number }; scans?: Array<{ dex?: string | null; pairAddress?: string | null; lpMintStatus?: string; lpMint?: string | null; lpScan?: { burnedPct?: number | null; lockedPct?: number | null } | { error?: string } | null }> };
type Capabilities = { liveTradingEnabled?: boolean; quotePreview?: string; swapBuilder?: string; broadcaster?: string; signer?: string; disabledReason?: string | null; engines?: Record<string, string>; routes?: Record<string, string> };
type QuotePayload = { status?: string; execution?: string; error?: string; request?: { side?: string; amount?: number; spendAsset?: string; slippageBps?: number }; quote?: { outAmount?: string | null; priceImpactPct?: string | null; routeLabels?: string[]; routePlanLength?: number; contextSlot?: number | null; timeTaken?: number | null }; safety?: string };

function usd(value?: number | null) {
  if (typeof value !== 'number') return '0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function pct(value?: number | null) { return typeof value === 'number' ? `${value.toFixed(2)}%` : '0.00%'; }
function compact(value?: string | null) { return value ? `${value.slice(0, 6)}…${value.slice(-5)}` : '—'; }
function price(value?: string | number | null) { const n = Number(value); return Number.isFinite(n) && n > 0 ? `$${n.toPrecision(n < 0.01 ? 4 : 6)}` : '—'; }
function isLpData(value: unknown): value is { burnedPct?: number | null; lockedPct?: number | null } { return Boolean(value && typeof value === 'object' && !('error' in value)); }

export function LiquidityEngineProbe() {
  const [mint, setMint] = useState('');
  const [loading, setLoading] = useState(false);
  const [pool, setPool] = useState<PoolIndex | null>(null);
  const [lp, setLp] = useState<LpScan | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [quote, setQuote] = useState<QuotePayload | null>(null);
  const [quoteAmount, setQuoteAmount] = useState('0.05');
  const [quoteSide, setQuoteSide] = useState<'Buy' | 'Sell'>('Buy');
  const [spendAsset, setSpendAsset] = useState<'SOL' | 'USDC'>('SOL');
  const [slippageBps, setSlippageBps] = useState('100');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState('');

  async function runProbe() {
    setLoading(true); setError(''); setPool(null); setLp(null); setCaps(null); setQuote(null);
    try {
      const [poolRes, lpRes, capsRes] = await Promise.all([
        fetch(`/api/token-pool-index?mint=${encodeURIComponent(mint)}`),
        fetch(`/api/lp-lock-burn-scanner?mint=${encodeURIComponent(mint)}`),
        fetch('/api/execution-capabilities')
      ]);
      const poolPayload = await poolRes.json();
      const lpPayload = await lpRes.json();
      const capsPayload = await capsRes.json();
      if (!poolRes.ok) throw new Error(poolPayload.error ?? 'Pool index failed.');
      if (!lpRes.ok) throw new Error(lpPayload.error ?? 'LP scanner failed.');
      setPool(poolPayload as PoolIndex);
      setLp(lpPayload as LpScan);
      setCaps(capsPayload as Capabilities);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Liquidity probe failed.');
    } finally {
      setLoading(false);
    }
  }


  async function previewRoute() {
    if (!mint) return;
    setQuoteLoading(true);
    setError('');
    setQuote(null);
    try {
      const response = await fetch('/api/execution-quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mint, side: quoteSide, amount: quoteAmount, spendAsset, slippageBps })
      });
      const payload = await response.json() as QuotePayload;
      if (!response.ok) throw new Error(payload.error ?? 'Route preview failed.');
      setQuote(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Route preview failed.');
    } finally {
      setQuoteLoading(false);
    }
  }

  const bestScan = lp?.scans?.find((scan) => isLpData(scan.lpScan));
  const bestLp = isLpData(bestScan?.lpScan) ? bestScan?.lpScan : null;

  return (
    <section className="documentCard liquidityEngineProbe">
      <div className="sectionIntro compactIntro">
        <span>Live liquidity backend</span>
        <h2>Pool + LP scanner</h2>
        <p>Enter a mint to query real pool liquidity, venue coverage, LP mint resolution, and lock/burn status.</p>
      </div>
      <div className="terminalTokenInput premiumTokenInput">
        <input placeholder="Paste token mint" value={mint} onChange={(event) => setMint(event.target.value)} />
        <button type="button" onClick={runProbe} disabled={!mint || loading}>{loading ? 'Reading…' : 'Read liquidity'}</button>
      </div>
      {error && <p className="dangerText">{error}</p>}
      <div className="premiumTokenStats liquidityProbeStats">
        <div><span>Pools</span><strong>{pool?.summary?.pairCount ?? 0}</strong><small>{pool?.summary?.venues?.join(' / ') || 'No token loaded'}</small></div>
        <div><span>Liquidity</span><strong>{usd(pool?.summary?.liquidityUsd)}</strong><small>{usd(pool?.summary?.volume24h)} 24h volume</small></div>
        <div><span>Best venue</span><strong>{pool?.summary?.bestDex ?? '—'}</strong><small>{pool?.summary?.bestPairAddress ? compact(pool.summary.bestPairAddress) : 'Load token'}</small></div>
        <div><span>Pool age</span><strong>{pool?.summary?.firstSeenAt ? new Date(pool.summary.firstSeenAt).toLocaleDateString() : '—'}</strong><small>{pool?.summary?.poolAgeSource ?? 'pool index source'}</small></div>
        <div><span>LP mints</span><strong>{lp?.summary ? `${lp.summary.lpMintsResolved}/${lp.summary.poolsScanned}` : '0/0'}</strong><small>{lp?.summary?.unresolvedPools ?? 0} unresolved layouts</small></div>
        <div><span>LP custody</span><strong>{pct(bestLp?.burnedPct)} / {pct(bestLp?.lockedPct)}</strong><small>{bestScan?.lpMint ? compact(bestScan.lpMint) : 'LP mint unresolved'}</small></div>
      </div>
      <div className="liquidityActionGrid">
        <div className="liquidityRoutePanel">
          <div className="tablePanelHeader"><span>Jupiter route preview</span><strong>{quote?.status ?? 'ready'}</strong></div>
          <div className="liquidityRouteControls">
            <select value={quoteSide} onChange={(event) => setQuoteSide(event.target.value as 'Buy' | 'Sell')}><option>Buy</option><option>Sell</option></select>
            <input value={quoteAmount} onChange={(event) => setQuoteAmount(event.target.value)} inputMode="decimal" placeholder="Amount" />
            <select value={spendAsset} onChange={(event) => setSpendAsset(event.target.value as 'SOL' | 'USDC')}><option>SOL</option><option>USDC</option></select>
            <input value={slippageBps} onChange={(event) => setSlippageBps(event.target.value)} inputMode="numeric" placeholder="Slippage bps" />
            <button type="button" onClick={previewRoute} disabled={!mint || quoteLoading}>{quoteLoading ? 'Quoting…' : 'Preview route'}</button>
          </div>
          <div className="terminalDataTable liquidityQuoteTable" role="table" aria-label="Jupiter quote preview">
            <div className="terminalDataRow terminalDataHead" role="row"><span>Route</span><span>Out amount</span><span>Impact</span><span>Slot</span><span>Safety</span></div>
            <div className="terminalDataRow" role="row"><strong>{quote?.quote?.routeLabels?.join(' / ') || 'No quote yet'}</strong><span>{quote?.quote?.outAmount ?? '—'}</span><span>{quote?.quote?.priceImpactPct ?? '—'}</span><span>{quote?.quote?.contextSlot ?? '—'}</span><span>{quote?.safety ?? (caps?.liveTradingEnabled ? 'Live gate enabled; browser signing still required' : caps?.disabledReason ?? 'Quote only until live gate enabled')}</span></div>
          </div>
        </div>
        <div className="liquidityGatePanel">
          <div className="tablePanelHeader"><span>Execution gates</span><strong>{caps?.liveTradingEnabled ? 'live enabled' : 'live gated'}</strong></div>
          <div className="terminalDataTable liquidityGateTable" role="table" aria-label="Execution route gates">
            <div className="terminalDataRow terminalDataHead" role="row"><span>Route</span><span>Status</span><span>Reason</span></div>
            <div className="terminalDataRow" role="row"><strong>Quote preview</strong><span>{caps?.quotePreview ?? caps?.routes?.quotePreview ?? '/api/execution-quote'}</span><span>Read-only route</span></div>
            <div className="terminalDataRow" role="row"><strong>Swap builder</strong><span>{caps?.swapBuilder ?? caps?.routes?.swapBuilder ?? '/api/execution-swap'}</span><span>{caps?.disabledReason ?? 'Requires live gate + browser signer'}</span></div>
            <div className="terminalDataRow" role="row"><strong>Broadcaster</strong><span>{caps?.broadcaster ?? caps?.routes?.broadcaster ?? '/api/send-signed-transaction'}</span><span>Signed transaction only</span></div>
          </div>
        </div>
      </div>
      <div className="terminalDataTable liquidityPoolTable" role="table" aria-label="Pool venue rows">
        <div className="terminalDataRow terminalDataHead" role="row"><span>DEX</span><span>Pair</span><span>Liquidity</span><span>Volume 24h</span><span>Price</span><span>Market cap</span></div>
        {(pool?.pairs ?? []).slice(0, 10).map((pair, index) => <div className="terminalDataRow" role="row" key={`${pair.pairAddress}-${index}`}><strong>{pair.dex ?? 'DEX'}</strong><span>{pair.pairAddress ? <a href={`https://dexscreener.com/solana/${pair.pairAddress}`} target="_blank" rel="noreferrer">{compact(pair.pairAddress)}</a> : '—'}</span><span>{usd(pair.liquidityUsd)}</span><span>{usd(pair.volume24h)}</span><span>{price(pair.priceUsd)}</span><span>{usd(pair.marketCap ?? pair.fdv ?? null)}</span></div>)}
        {!pool?.pairs?.length && <div className="terminalDataRow" role="row"><strong>No pool rows</strong><span>Load a token mint</span><span>—</span><span>—</span><span>—</span><span>—</span></div>}
      </div>
      <div className="terminalDataTable liquidityLpTable" role="table" aria-label="LP lock burn scan rows">
        <div className="terminalDataRow terminalDataHead" role="row"><span>DEX</span><span>Pair</span><span>LP mint</span><span>LP status</span><span>Burned</span><span>Locked</span></div>
        {(lp?.scans ?? []).slice(0, 10).map((scan, index) => {
          const data = isLpData(scan.lpScan) ? scan.lpScan : null;
          return <div className="terminalDataRow" role="row" key={`${scan.pairAddress}-${index}`}><strong>{scan.dex ?? 'DEX'}</strong><span>{scan.pairAddress ? compact(scan.pairAddress) : '—'}</span><span>{scan.lpMint ? compact(scan.lpMint) : 'unresolved'}</span><span>{scan.lpMintStatus ?? 'unresolved'}</span><span>{pct(data?.burnedPct)}</span><span>{pct(data?.lockedPct)}</span></div>;
        })}
        {!lp?.scans?.length && <div className="terminalDataRow" role="row"><strong>No LP rows</strong><span>Load a token mint</span><span>—</span><span>—</span><span>—</span><span>—</span></div>}
      </div>
    </section>
  );
}
