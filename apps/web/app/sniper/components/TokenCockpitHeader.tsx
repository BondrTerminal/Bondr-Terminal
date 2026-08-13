'use client';

import { useEffect, useMemo, useState } from 'react';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type Json = Record<string, unknown>;

type CockpitSnapshot = {
  tokenIdentity?: Json;
  pairIdentity?: Json;
  market?: Json;
  liquidity?: Json;
  security?: Json;
  sourceStatus?: Record<string, Json>;
  providerReadiness?: Json;
};

function objectValue(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function numberValue(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function stringValue(value: unknown, fallback = '—') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function formatUsd(value: unknown, fallback = '—') {
  const number = numberValue(value);
  if (number === null) return fallback;
  if (Math.abs(number) >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(number) >= 1_000_000) return `$${(number / 1_000_000).toFixed(2)}M`;
  if (Math.abs(number) >= 1_000) return `$${(number / 1_000).toFixed(1)}K`;
  if (Math.abs(number) < 0.01 && number !== 0) return `$${number.toPrecision(3)}`;
  return `$${number.toLocaleString(undefined, { maximumFractionDigits: number >= 100 ? 0 : 4 })}`;
}

function formatNumber(value: unknown, fallback = '—') {
  const number = numberValue(value);
  if (number === null) return fallback;
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPct(value: unknown, fallback = '—') {
  const number = numberValue(value);
  if (number === null) return fallback;
  return `${number > 0 ? '+' : ''}${number.toFixed(Math.abs(number) >= 10 ? 1 : 2)}%`;
}

function compactAddress(value: unknown) {
  const address = typeof value === 'string' ? value : '';
  return ADDRESS_RE.test(address) ? `${address.slice(0, 5)}…${address.slice(-5)}` : '—';
}

function toneForChange(value: unknown) {
  const number = numberValue(value);
  if (number === null || number === 0) return 'neutral';
  return number > 0 ? 'positive' : 'negative';
}

function riskTone(status: string) {
  const lower = status.toLowerCase();
  if (['pass', 'ok', 'healthy', 'ready'].some((word) => lower.includes(word))) return 'positive';
  if (['avoid', 'risk', 'rug', 'fail', 'blocked', 'danger'].some((word) => lower.includes(word))) return 'negative';
  if (['watch', 'partial', 'warn', 'unknown'].some((word) => lower.includes(word))) return 'warn';
  return 'neutral';
}

function normalizeSnapshot(payload: Json | null): CockpitSnapshot {
  const normalized = objectValue(payload?.normalized);
  const source = Object.keys(normalized).length ? normalized : objectValue(payload);
  return {
    tokenIdentity: objectValue(source.tokenIdentity),
    pairIdentity: objectValue(source.pairIdentity),
    market: objectValue(source.market),
    liquidity: objectValue(source.liquidity),
    security: objectValue(source.security),
    sourceStatus: objectValue(source.sourceStatus) as Record<string, Json>,
    providerReadiness: objectValue(source.providerReadiness)
  };
}

export function TokenCockpitHeader({ mint }: { mint?: string }) {
  const [activeMint, setActiveMint] = useState(mint ?? '');
  const [payload, setPayload] = useState<Json | null>(null);
  const [status, setStatus] = useState(mint ? 'loading' : 'waiting');

  useEffect(() => setActiveMint(mint ?? ''), [mint]);

  useEffect(() => {
    function onTokenLoaded(event: Event) {
      const detail = (event as CustomEvent<{ mint?: string }>).detail;
      if (detail?.mint) setActiveMint(detail.mint);
    }
    window.addEventListener('meridian-token-loaded', onTokenLoaded);
    return () => window.removeEventListener('meridian-token-loaded', onTokenLoaded);
  }, []);

  useEffect(() => {
    if (!ADDRESS_RE.test(activeMint)) {
      setPayload(null);
      setStatus('waiting');
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7_000);
    setStatus('loading');
    fetch(`/api/terminal/snapshot?mint=${encodeURIComponent(activeMint)}&profile=live-read&limit=40&holderLimit=50`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const json = await response.json().catch(() => null) as Json | null;
        setPayload(json);
        setStatus(response.ok ? 'ok' : `http-${response.status}`);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'snapshot failed');
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [activeMint]);

  const snapshot = useMemo(() => normalizeSnapshot(payload), [payload]);
  const token = snapshot.tokenIdentity ?? {};
  const pair = snapshot.pairIdentity ?? {};
  const market = snapshot.market ?? {};
  const liquidity = snapshot.liquidity ?? {};
  const security = snapshot.security ?? {};
  const sourceStatus = snapshot.sourceStatus ?? {};
  const marketStatus = objectValue(sourceStatus.market);
  const holderStatus = objectValue(sourceStatus.holders);
  const liquidityStatus = objectValue(sourceStatus.liquidity);
  const riskStatus = stringValue(security.riskStatus ?? security.status, status === 'waiting' ? 'scan token' : status);
  const symbol = stringValue(token.symbol, activeMint ? 'TOKEN' : 'No token');
  const name = stringValue(token.name, activeMint ? 'Loaded from canonical snapshot' : 'Paste a Solana mint/link to load intelligence');
  const change24h = market.priceChange24hPct;
  const top10 = security.top10Pct;
  const holderCount = holderStatus.walletCountReturned ?? holderStatus.walletCount ?? holderStatus.totalHolders ?? security.holderCount;
  const provider = stringValue(marketStatus.source ?? market.source ?? sourceStatus.source, 'snapshot');
  const lpStatus = stringValue(liquidity.lpStatus ?? liquidity.lpModel ?? liquidityStatus.status, '—');
  const canCopy = ADDRESS_RE.test(activeMint);

  async function copyMint() {
    if (!canCopy) return;
    await navigator.clipboard?.writeText(activeMint).catch(() => undefined);
  }

  return <section className={`bondrTokenCockpit ${status === 'waiting' ? 'isWaiting' : ''}`} aria-label="Token cockpit">
    <div className="bondrTokenIdentityBlock">
      <div className="bondrTokenAvatar" aria-hidden>{symbol.slice(0, 2).toUpperCase()}</div>
      <div className="bondrTokenTitle">
        <span>{symbol}</span>
        <strong>{name}</strong>
        <button type="button" onClick={copyMint} disabled={!canCopy} title="Copy token mint">{canCopy ? compactAddress(activeMint) : 'No mint loaded'}</button>
      </div>
    </div>

    <div className="bondrCockpitMetrics" aria-label="Market metrics">
      <div><span>Price</span><strong>{formatUsd(market.priceUsd)}</strong></div>
      <div><span>MC / FDV</span><strong>{formatUsd(market.marketCapUsd)} / {formatUsd(market.fdvUsd)}</strong></div>
      <div><span>Liq</span><strong>{formatUsd(liquidity.liquidityUsd ?? market.liquidityUsd)}</strong></div>
      <div><span>Vol 24h</span><strong>{formatUsd(market.volume24hUsd)}</strong></div>
      <div><span>24h</span><strong data-tone={toneForChange(change24h)}>{formatPct(change24h)}</strong></div>
      <div><span>B/S</span><strong><em className="bondrBuyText">{formatNumber(market.buys)}</em> / <em className="bondrSellText">{formatNumber(market.sells)}</em></strong></div>
      <div><span>Holders</span><strong>{formatNumber(holderCount)}</strong></div>
      <div><span>Top 10</span><strong data-tone={toneForChange(-(numberValue(top10) ?? 0))}>{formatPct(top10)}</strong></div>
      <div><span>LP</span><strong>{lpStatus}</strong></div>
    </div>

    <div className="bondrCockpitStatus">
      <span data-tone={riskTone(riskStatus)}>{riskStatus}</span>
      <small>{stringValue(pair.dexId ?? pair.poolAgeSource, 'pool pending')} · {provider}</small>
      <small>{status === 'ok' ? 'canonical snapshot' : status}</small>
    </div>
  </section>;
}
