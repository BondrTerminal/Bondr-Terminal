'use client';

import { useState } from 'react';
import type { TransactionPreview } from '../../../lib/transaction-preview';

type SourceStatus = { status?: string; source?: string | null; observedAt?: string | null; note?: string | null; blockers?: string[]; nextCredentialNeeded?: string | null; lockBurnApplicability?: string | null };
type PoolIndex = { summary?: { pairCount?: number; liquidityUsd?: number; volume24h?: number; venues?: string[]; bestDex?: string | null; bestPairAddress?: string | null; poolAgeSource?: string | null; firstSeenAt?: string | null }; pairs?: Array<{ dex?: string | null; pairAddress?: string | null; liquidityUsd?: number; volume24h?: number; priceUsd?: string | number | null; marketCap?: number | null; fdv?: number | null; url?: string | null }> };
type LpScan = { summary?: { poolsScanned?: number; lpMintsResolved?: number; unresolvedPools?: number }; scans?: Array<{ dex?: string | null; pairAddress?: string | null; lpMintStatus?: string; lpMint?: string | null; lpModel?: string | null; lockBurnApplicability?: string | null; reason?: string | null; nextCredentialNeeded?: string | null; lpScan?: { burnedPct?: number | null; lockedPct?: number | null } | { error?: string } | null }> };
type TerminalSnapshot = {
  status?: string;
  observedAt?: string;
  market?: { liquidityUsd?: number | null; volume24hUsd?: number | null; priceUsd?: number | null; marketCapUsd?: number | null; sourceStatus?: SourceStatus };
  liquidity?: { liquidityUsd?: number | null; lpBurnedPct?: number | null; lpLockedPct?: number | null; lpModel?: string | null; lockBurnApplicability?: string | null; lpScanStatus?: string | null; lpReason?: string | null; lpNextCredentialNeeded?: string | null; lpPoolsScanned?: number | null; lpMintsResolved?: number | null; scans?: LpScan['scans']; sourceStatus?: SourceStatus };
  pool?: PoolIndex | null;
  sourceStatus?: { liquidity?: SourceStatus; market?: SourceStatus };
  normalized?: { canonicalLiquidity?: { sourceStatus?: SourceStatus; data?: TerminalSnapshot['liquidity'] }; canonicalMarket?: { sourceStatus?: SourceStatus; data?: TerminalSnapshot['market'] } };
};
type Capabilities = { liveTradingEnabled?: boolean;
  signingEnabled?: boolean;
  broadcastEnabled?: boolean;
  deploymentEnabled?: boolean;
  readinessLevel?: string; quotePreview?: string; swapBuilder?: string; broadcaster?: string; signer?: string; disabledReason?: string | null; engines?: Record<string, string>; routes?: Record<string, string> };
type QuotePayload = { status?: string; execution?: string; error?: string; request?: { side?: string; amount?: number; spendAsset?: string; slippageBps?: number }; quote?: { outAmount?: string | null; priceImpactPct?: string | null; routeLabels?: string[]; routePlanLength?: number; contextSlot?: number | null; timeTaken?: number | null }; safety?: string; transactionPreview?: TransactionPreview };
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_ADDRESS_IN_TEXT_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

function extractMint(input: string) {
  const trimmed = input.trim();
  if (SOLANA_ADDRESS_RE.test(trimmed)) return trimmed;
  const matches = trimmed.match(SOLANA_ADDRESS_IN_TEXT_RE) ?? [];
  return matches.find((candidate) => SOLANA_ADDRESS_RE.test(candidate)) ?? '';
}

function usd(value?: number | null, empty = '—') {
  if (typeof value !== 'number') return empty;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function pct(value?: number | null) { return typeof value === 'number' ? `${value.toFixed(2)}%` : 'n/a'; }
function compact(value?: string | null) { return value ? `${value.slice(0, 6)}…${value.slice(-5)}` : '—'; }
function price(value?: string | number | null) { const n = Number(value); return Number.isFinite(n) && n > 0 ? `$${n.toPrecision(n < 0.01 ? 4 : 6)}` : '—'; }
function isLpData(value: unknown): value is { burnedPct?: number | null; lockedPct?: number | null } { return Boolean(value && typeof value === 'object' && !('error' in value)); }
function applicabilityLabel(value?: string | null) {
  if (!value) return 'model pending';
  if (value === 'not-applicable-position-model') return 'CLMM/DLMM position model — LP burn/lock % not applicable';
  return value;
}
function degraded(status?: SourceStatus | null) {
  if (!status) return 'source metadata pending';
  const blockers = status.blockers?.filter(Boolean).join('; ');
  return blockers || status.note || status.nextCredentialNeeded || status.status || 'ok';
}

export function LiquidityEngineProbe() {
  const [mint, setMint] = useState('');
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<TerminalSnapshot | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [quote, setQuote] = useState<QuotePayload | null>(null);
  const [quoteAmount, setQuoteAmount] = useState('0.05');
  const [quoteSide, setQuoteSide] = useState<'Buy' | 'Sell'>('Buy');
  const [spendAsset, setSpendAsset] = useState<'SOL' | 'USDC'>('SOL');
  const [slippageBps, setSlippageBps] = useState('100');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState('');

  async function runProbe() {
    const normalizedMint = extractMint(mint);
    if (!normalizedMint) {
      setError('Paste a valid Solana token mint/contract address. URLs are okay if they contain the mint.');
      setSnapshot(null);
      setCaps(null);
      setQuote(null);
      return;
    }
    setMint(normalizedMint);
    setLoading(true); setError(''); setSnapshot(null); setCaps(null); setQuote(null);
    try {
      const params = new URLSearchParams({ mint: normalizedMint, holderLimit: '10', limit: '10', profile: 'live-read', enrich: '1' });
      const [snapshotRes, capsRes] = await Promise.all([
        fetch(`/api/terminal/snapshot?${params.toString()}`, { cache: 'no-store' }),
        fetch('/api/execution-capabilities', { cache: 'no-store' })
      ]);
      const snapshotPayload = await snapshotRes.json();
      const capsPayload = await capsRes.json();
      if (!snapshotRes.ok) throw new Error(snapshotPayload.error ?? snapshotPayload.note ?? 'Canonical terminal snapshot failed.');
      setSnapshot(snapshotPayload as TerminalSnapshot);
      setCaps(capsPayload as Capabilities);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Liquidity probe failed.');
    } finally {
      setLoading(false);
    }
  }


  async function previewRoute() {
    const normalizedMint = extractMint(mint);
    if (!normalizedMint) {
      setError('Paste a valid Solana token mint/contract address before previewing a route.');
      return;
    }
    setMint(normalizedMint);
    setQuoteLoading(true);
    setError('');
    setQuote(null);
    try {
      const response = await fetch('/api/execution-quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mint: normalizedMint, side: quoteSide, amount: quoteAmount, spendAsset, slippageBps })
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

  const pool = snapshot?.pool ?? null;
  const liquidity = snapshot?.liquidity ?? snapshot?.normalized?.canonicalLiquidity?.data ?? null;
  const market = snapshot?.market ?? snapshot?.normalized?.canonicalMarket?.data ?? null;
  const liquidityStatus = liquidity?.sourceStatus ?? snapshot?.sourceStatus?.liquidity ?? snapshot?.normalized?.canonicalLiquidity?.sourceStatus ?? null;
  const scans = liquidity?.scans ?? [];
  const bestScan = scans.find((scan) => isLpData(scan.lpScan));
  const bestLp = isLpData(bestScan?.lpScan) ? bestScan?.lpScan : null;
  const poolLiquidityUsd = liquidity?.liquidityUsd ?? market?.liquidityUsd ?? pool?.summary?.liquidityUsd ?? null;
  const volume24hUsd = market?.volume24hUsd ?? pool?.summary?.volume24h ?? null;
  const lockBurnApplicability = liquidity?.lockBurnApplicability ?? bestScan?.lockBurnApplicability ?? liquidityStatus?.lockBurnApplicability ?? null;
  const positionModel = lockBurnApplicability === 'not-applicable-position-model';

  return (
    <section className="documentCard liquidityEngineProbe">
      <div className="sectionIntro compactIntro">
        <span>Canonical liquidity backend</span>
        <h2>Pool + LP scanner</h2>
        <p>Enter a mint to query the same canonical terminal snapshot fields used by Terminal Intelligence.</p>
      </div>
      <div className="terminalTokenInput premiumTokenInput">
        <input placeholder="Paste token mint, contract URL, or DexScreener/Solscan link" value={mint} onChange={(event) => setMint(event.target.value)} />
        <button type="button" onClick={runProbe} disabled={!mint || loading}>{loading ? 'Reading…' : 'Read canonical liquidity'}</button>
      </div>
      {error && <p className="dangerText">{error}</p>}
      {snapshot && <p className="mutedText">Canonical route: /api/terminal/snapshot · liquidity status: {degraded(liquidityStatus)}</p>}
      <div className="premiumTokenStats liquidityProbeStats">
        <div><span>Pools</span><strong>{pool?.summary?.pairCount ?? 0}</strong><small>{pool?.summary?.venues?.join(' / ') || degraded(liquidityStatus)}</small></div>
        <div><span>Liquidity</span><strong>{usd(poolLiquidityUsd)}</strong><small>{usd(volume24hUsd)} 24h volume</small></div>
        <div><span>Best venue</span><strong>{pool?.summary?.bestDex ?? '—'}</strong><small>{pool?.summary?.bestPairAddress ? compact(pool.summary.bestPairAddress) : 'Load token'}</small></div>
        <div><span>Pool age</span><strong>{pool?.summary?.firstSeenAt ? new Date(pool.summary.firstSeenAt).toLocaleDateString() : '—'}</strong><small>{pool?.summary?.poolAgeSource ?? 'pool index source'}</small></div>
        <div><span>LP mints</span><strong>{typeof liquidity?.lpMintsResolved === 'number' || typeof liquidity?.lpPoolsScanned === 'number' ? `${liquidity?.lpMintsResolved ?? 0}/${liquidity?.lpPoolsScanned ?? 0}` : '0/0'}</strong><small>{applicabilityLabel(lockBurnApplicability)}</small></div>
        <div><span>LP custody</span><strong>{positionModel ? 'n/a' : `${pct(liquidity?.lpBurnedPct ?? bestLp?.burnedPct)} / ${pct(liquidity?.lpLockedPct ?? bestLp?.lockedPct)}`}</strong><small>{positionModel ? 'position-based pool' : bestScan?.lpMint ? compact(bestScan.lpMint) : liquidity?.lpReason ?? 'LP mint unresolved'}</small></div>
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
          <div className="tablePanelHeader"><span>Execution gates</span><strong>{caps?.signingEnabled ? 'signing ready' : caps?.liveTradingEnabled ? 'live build enabled' : 'live gated'}</strong></div>
          <div className="terminalDataTable liquidityGateTable" role="table" aria-label="Execution route gates">
            <div className="terminalDataRow terminalDataHead" role="row"><span>Route</span><span>Status</span><span>Reason</span></div>
            {quote?.transactionPreview && <div className="liquidityTransactionPreview"><strong>Preview safety</strong><span>Signing: {quote.transactionPreview.signingEnabled ? 'enabled' : 'disabled'}</span><span>Broadcast: {quote.transactionPreview.broadcastEnabled ? 'enabled' : 'disabled'}</span><em>{quote.transactionPreview.blockers.slice(0, 2).join(' · ') || 'No blockers reported'}</em></div>}
            <div className="terminalDataRow" role="row"><strong>Quote preview</strong><span>{caps?.quotePreview ?? caps?.routes?.quotePreview ?? '/api/execution-quote'}</span><span>Read-only route</span></div>
            <div className="terminalDataRow" role="row"><strong>Swap builder</strong><span>{caps?.swapBuilder ?? caps?.routes?.swapBuilder ?? '/api/execution-swap'}</span><span>{caps?.disabledReason ?? (caps?.signingEnabled ? 'Signing/simulation enabled; broadcast remains disabled' : 'Requires live gate + browser signer')}</span></div>
            <div className="terminalDataRow" role="row"><strong>Broadcaster</strong><span>{caps?.broadcaster ?? caps?.routes?.broadcaster ?? '/api/send-signed-transaction'}</span><span>Signed transaction only</span></div>
          </div>
        </div>
      </div>
      <div className="terminalDataTable liquidityPoolTable" role="table" aria-label="Pool venue rows">
        <div className="terminalDataRow terminalDataHead" role="row"><span>DEX</span><span>Pair</span><span>Liquidity</span><span>Volume 24h</span><span>Price</span><span>Market cap</span></div>
        {(pool?.pairs ?? []).slice(0, 10).map((pair, index) => <div className="terminalDataRow" role="row" key={`${pair.pairAddress}-${index}`}><strong>{pair.dex ?? 'DEX'}</strong><span>{pair.pairAddress ? <a href={`https://dexscreener.com/solana/${pair.pairAddress}`} target="_blank" rel="noreferrer">{compact(pair.pairAddress)}</a> : '—'}</span><span>{usd(pair.liquidityUsd)}</span><span>{usd(pair.volume24h)}</span><span>{price(pair.priceUsd)}</span><span>{usd(pair.marketCap ?? pair.fdv ?? null)}</span></div>)}
        {!pool?.pairs?.length && <div className="terminalDataRow" role="row"><strong>No pool rows</strong><span>{snapshot ? degraded(liquidityStatus) : 'Load a token mint'}</span><span>—</span><span>—</span><span>—</span><span>—</span></div>}
      </div>
      <div className="terminalDataTable liquidityLpTable" role="table" aria-label="LP lock burn scan rows">
        <div className="terminalDataRow terminalDataHead" role="row"><span>DEX</span><span>Pair</span><span>LP model</span><span>LP status</span><span>Burned</span><span>Locked</span></div>
        {scans.slice(0, 10).map((scan, index) => {
          const data = isLpData(scan.lpScan) ? scan.lpScan : null;
          const rowPositionModel = scan.lockBurnApplicability === 'not-applicable-position-model';
          return <div className="terminalDataRow" role="row" key={`${scan.pairAddress}-${index}`}><strong>{scan.dex ?? 'DEX'}</strong><span>{scan.pairAddress ? compact(scan.pairAddress) : '—'}</span><span>{scan.lpModel ?? 'unknown'}</span><span>{scan.lpMintStatus ?? applicabilityLabel(scan.lockBurnApplicability)}</span><span>{rowPositionModel ? 'n/a' : pct(data?.burnedPct)}</span><span>{rowPositionModel ? 'n/a' : pct(data?.lockedPct)}</span></div>;
        })}
        {!scans.length && <div className="terminalDataRow" role="row"><strong>No LP rows</strong><span>{snapshot ? degraded(liquidityStatus) : 'Load a token mint'}</span><span>—</span><span>—</span><span>—</span><span>—</span></div>}
      </div>
    </section>
  );
}
