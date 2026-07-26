'use client';

import { useEffect, useState } from 'react';

type TokenIntel = {
  mint: string;
  source: string;
  onChain?: {
    status: string;
    rpcProvider: string;
    rpcConfigured: boolean;
    decimals: number | null;
    supplyUi: number | null;
    rawSupply: string | null;
    mintAuthority: string | null;
    freezeAuthority: string | null;
    note: string | null;
  };
  pairCount: number;
  bestPair: null | {
    dex?: string;
    pairAddress?: string;
    url?: string;
    base?: { symbol?: string; name?: string };
    quote?: { symbol?: string; name?: string };
    priceUsd?: string;
    liquidityUsd: number;
    volume24h: number;
    marketCap: number | null;
    fdv: number | null;
  };
  pairs: Array<{ dex?: string; base?: string; quote?: string; liquidityUsd: number; volume24h: number; url?: string }>;
  riskFlags: string[];
  execution: string;
};

function clamp(value: number, min = 8, max = 96) {
  return Math.max(min, Math.min(max, value));
}

function buildProjectionPoints(intel: TokenIntel): number[] {
  const liquidity = intel.bestPair?.liquidityUsd ?? 0;
  const volume = intel.bestPair?.volume24h ?? 0;
  const marketCap = intel.bestPair?.marketCap ?? intel.bestPair?.fdv ?? 0;
  const pairScore = clamp(intel.pairCount * 12, 10, 80);
  const liquidityScore = clamp(Math.log10(liquidity + 1) * 13, 8, 92);
  const volumeScore = clamp(Math.log10(volume + 1) * 12, 8, 90);
  const capBalance = marketCap > 0 ? clamp((liquidity / marketCap) * 260, 8, 82) : 18;
  const warningPenalty = intel.riskFlags.length * 10;
  const base = clamp((liquidityScore * 0.4) + (volumeScore * 0.35) + (pairScore * 0.15) + (capBalance * 0.1) - warningPenalty, 5, 90);
  return [
    clamp(base - 14),
    clamp(base - 6 + pairScore * 0.04),
    clamp(base + volumeScore * 0.08),
    clamp(base + liquidityScore * 0.1 - warningPenalty * 0.2),
    clamp(base + capBalance * 0.08),
    clamp(base + volumeScore * 0.05 + liquidityScore * 0.06 - warningPenalty * 0.25)
  ];
}

function TokenProjectionGraph({ intel }: { intel: TokenIntel }) {
  const points = buildProjectionPoints(intel);
  const width = 720;
  const height = 230;
  const pad = 28;
  const x = (index: number) => pad + (index / (points.length - 1)) * (width - pad * 2);
  const y = (value: number) => pad + ((100 - value) / 100) * (height - pad * 2);
  const path = points.map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(' ');
  const area = `${path} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`;
  const finalScore = Math.round(points.at(-1) ?? 0);

  return (
    <section className="tokenProjectionPanel">
      <div className="sectionIntro compactIntro">
        <span>Visual projection</span>
        <h2>Route health projection</h2>
        <p>Line graph generated from this scan’s liquidity, volume, pair count, market-cap context, and basic warnings. This is not a price prediction.</p>
      </div>
      <div className="tokenProjectionScore">
        <span>Projected route health</span>
        <strong>{finalScore}/100</strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="tokenProjectionChart" role="img" aria-label="Token route health projection line graph">
        <path className="projectionGrid" d={`M ${pad} ${height - pad} H ${width - pad} M ${pad} ${height / 2} H ${width - pad} M ${pad} ${pad} H ${width - pad}`} />
        <path className="projectionArea" d={area} />
        <path className="projectionLine" d={path} />
        {points.map((value, index) => <circle key={`${value}-${index}`} cx={x(index)} cy={y(value)} r="4" />)}
      </svg>
      <div className="projectionLegend">
        <span>Scan</span><span>Liquidity</span><span>Volume</span><span>Route</span><span>Risk</span><span>Review</span>
      </div>
    </section>
  );
}

export function TokenIntelLookup({ defaultMint = '', embedded = false, compact = false }: { defaultMint?: string; embedded?: boolean; compact?: boolean }) {
  const [mint, setMint] = useState(defaultMint);
  const [intel, setIntel] = useState<TokenIntel | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function analyze() {
    setLoading(true);
    setError('');
    setIntel(null);
    try {
      const response = await fetch(`/api/token-intel?mint=${encodeURIComponent(mint)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Token lookup failed.');
      setIntel(data as TokenIntel);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token lookup failed.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!defaultMint || intel || loading) return;
    void analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultMint]);

  const Wrapper = embedded ? 'div' : 'section';

  return (
    <Wrapper className={embedded ? 'sniperConsole embeddedTokenScanner' : 'sniperConsole documentCard'}>
      <label htmlFor="contract-input">Token contract</label>
      <div className="contractInputRow">
        <input id="contract-input" placeholder="Paste token mint / contract address" value={mint} onChange={(event) => setMint(event.target.value)} />
        <button className="button" type="button" onClick={analyze} disabled={!mint || loading}>{loading ? 'Analyzing…' : 'Analyze token'}</button>
      </div>
      <p className="disabledNote">DexScreener + RPC/Helius-aware lookup. Send reviewed mints to the Trading Terminal for Jupiter route preview and gated browser-wallet execution.</p>
      {error && <p className="dangerText">{error}</p>}
      {intel && (
        <div className="tokenIntelResult">
          <TokenProjectionGraph intel={intel} />
          <div className={compact ? 'infoGrid terminalStatsGrid compactTerminalStats' : 'infoGrid terminalStatsGrid'}>
            <div className="sideRow"><span>Source</span><strong>{intel.source}</strong></div>
            <div className="sideRow"><span>RPC</span><strong>{intel.onChain?.rpcProvider ?? 'checking'}</strong></div>
            <div className="sideRow"><span>Supply</span><strong>{typeof intel.onChain?.supplyUi === 'number' ? intel.onChain.supplyUi.toLocaleString() : 'RPC limited'}</strong></div>
            <div className="sideRow"><span>Authorities</span><strong>{intel.onChain?.mintAuthority || intel.onChain?.freezeAuthority ? 'Review' : intel.onChain?.status === 'ok' ? 'Revoked/none' : 'RPC limited'}</strong></div>
            <div className="sideRow"><span>Pairs</span><strong>{intel.pairCount}</strong></div>
            <div className="sideRow"><span>Execution</span><strong>{intel.execution}</strong></div>
            <div className="sideRow"><span>Best route</span><strong>{intel.bestPair ? `${intel.bestPair.dex} ${intel.bestPair.base?.symbol ?? '?'} / ${intel.bestPair.quote?.symbol ?? '?'}` : 'No pair found'}</strong></div>
            <div className="sideRow"><span>Liquidity</span><strong>${(intel.bestPair?.liquidityUsd ?? 0).toLocaleString()}</strong></div>
            <div className="sideRow"><span>24h volume</span><strong>${(intel.bestPair?.volume24h ?? 0).toLocaleString()}</strong></div>
            {!compact && <div className="sideRow"><span>Market cap</span><strong>{intel.bestPair?.marketCap ? `$${intel.bestPair.marketCap.toLocaleString()}` : 'Unavailable'}</strong></div>}
            {!compact && <div className="sideRow"><span>Risk flags</span><strong>{intel.riskFlags.length ? intel.riskFlags.join(' · ') : 'No basic flags from route lookup'}</strong></div>}
          </div>
          {compact && <a className="button secondary compactAnalyzerLink" href={`/token-analyzer?mint=${intel.mint}`}>Open full Token Analyzer</a>}
          {!compact && <div className="projectTable tokenPairTable" role="table" aria-label="Token pairs">
            <div className="projectRow tokenPairRow projectHead"><span>DEX</span><span>Pair</span><span>Liquidity</span><span>Volume 24h</span><span>Review</span></div>
            {intel.pairs.map((pair, index) => (
              <div className="projectRow tokenPairRow" key={`${pair.dex}-${index}`}>
                <strong>{pair.dex ?? 'unknown'}</strong>
                <span>{pair.base ?? '?'} / {pair.quote ?? '?'}</span>
                <span>${pair.liquidityUsd.toLocaleString()}</span>
                <span>${pair.volume24h.toLocaleString()}</span>
                {pair.url ? <a href={pair.url} target="_blank" rel="noreferrer">Open</a> : <span>—</span>}
              </div>
            ))}
          </div>}
        </div>
      )}
    </Wrapper>
  );
}
