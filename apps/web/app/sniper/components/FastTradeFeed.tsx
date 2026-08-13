'use client';

import { useEffect, useState } from 'react';
import type { TerminalTradeEvent } from '../../../lib/terminal/contracts';

type FastTradeFeedPayload = {
  status?: string;
  rows?: Array<TerminalTradeEvent & { age?: string; provider?: string | null; confidence?: string | null; attributionStatus?: string | null }>;
  summary?: { rows?: number; buys?: number; sells?: number; buyVolumeUsd?: number; sellVolumeUsd?: number; netFlowUsd?: number; largestBuyUsd?: number; largestSellUsd?: number; lastTradeAge?: string | null };
  provider?: { primary?: string | null; status?: string | null; latencyMs?: number | null; note?: string | null; rows?: number };
  latencyMs?: number;
};

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function formatUsd(value: number | string | null | undefined, fallback = '—') {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(number)) return fallback;
  if (Math.abs(number) >= 1_000_000) return `$${(number / 1_000_000).toFixed(2)}M`;
  if (Math.abs(number) >= 1_000) return `$${(number / 1_000).toFixed(1)}K`;
  return `$${number.toLocaleString(undefined, { maximumFractionDigits: number >= 100 ? 0 : 2 })}`;
}

function formatAmount(value: number | string | null | undefined) {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(number)) return '—';
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return number.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function compactAddress(address: string | null | undefined) {
  return address && ADDRESS_RE.test(address) ? `${address.slice(0, 6)}…${address.slice(-5)}` : '—';
}

function compactAge(timestamp: string | null | undefined) {
  if (!timestamp) return '—';
  const ms = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ms)) return '—';
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

export function FastTradeFeed({ mint, compact = false }: { mint?: string; compact?: boolean }) {
  const [activeMint, setActiveMint] = useState(mint ?? '');
  const [feed, setFeed] = useState<FastTradeFeedPayload | null>(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    setActiveMint(mint ?? '');
  }, [mint]);

  useEffect(() => {
    function onTokenLoaded(event: Event) {
      const custom = event as CustomEvent<{ mint?: string }>;
      if (custom.detail?.mint) setActiveMint(custom.detail.mint);
    }
    window.addEventListener('meridian-token-loaded', onTokenLoaded);
    return () => window.removeEventListener('meridian-token-loaded', onTokenLoaded);
  }, []);

  useEffect(() => {
    if (!activeMint) {
      setFeed(null);
      setStatus('waiting');
      return;
    }
    const mintForRequest = activeMint;
    const controller = new AbortController();
    let cancelled = false;
    async function load(mode = 'initial') {
      const fast = mode === 'initial';
      const feedLimit = fast ? 80 : 180;
      setStatus(mode === 'initial' ? 'loading' : mode === 'enrich' ? 'enriching' : 'refreshing');
      const requestController = new AbortController();
      const timeout = window.setTimeout(() => requestController.abort(), fast ? 5_000 : 8_000);
      const abortRelay = () => requestController.abort();
      controller.signal.addEventListener('abort', abortRelay, { once: true });
      try {
        const response = await fetch(`/api/terminal/trade-feed?mint=${encodeURIComponent(mintForRequest)}&limit=${feedLimit}${fast ? '&fast=1' : ''}`, { cache: 'no-store', signal: requestController.signal });
        const payload = await response.json() as FastTradeFeedPayload;
        if (!cancelled) {
          const nextRows = payload.rows?.length ?? 0;
          setFeed((current) => nextRows > 0 || !current?.rows?.length ? payload : { ...current, status: payload.status ?? current.status, provider: payload.provider ?? current.provider, latencyMs: payload.latencyMs ?? current.latencyMs });
          setStatus(response.ok ? (nextRows > 0 ? 'live' : mode === 'initial' ? 'empty' : 'live-stale') : `feed-${response.status}`);
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) setStatus((current) => feed?.rows?.length ? 'live-stale' : error instanceof Error ? error.message : 'feed failed');
      } finally {
        window.clearTimeout(timeout);
        controller.signal.removeEventListener('abort', abortRelay);
      }
    }
    void load();
    const enrichTimer = window.setTimeout(() => void load('enrich'), 1_200);
    const interval = window.setInterval(() => void load('refresh'), 10_000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(enrichTimer);
      window.clearInterval(interval);
    };
  }, [activeMint]);

  const rows = feed?.rows ?? [];
  const summary = feed?.summary;
  const primary = feed?.provider?.primary ?? (activeMint ? 'trade-feed' : 'scan contract');
  const latency = typeof feed?.latencyMs === 'number' ? `${feed.latencyMs}ms` : typeof feed?.provider?.latencyMs === 'number' ? `${feed.provider.latencyMs}ms` : '—';
  const note = activeMint ? (feed?.provider?.note ?? 'No recent swaps from current provider.') : 'Paste or select a token contract to load swaps.';
  const shellRows = Array.from({ length: compact ? 18 : 12 }, (_, index) => index);
  const shellMode = rows.length === 0;

  return <section className={`axiomTradeFeedSurface liveTradeFeedBox ${compact ? 'compactLiveTradeFeedBox' : ''} ${shellMode ? 'liveTradeFeedShellMode' : ''}`} aria-label="Live trade feed">
    <div className="liveTradeFeedChrome">
      <div className="liveTradeFeedTitle"><span className={status === 'live' || status === 'refreshing' ? 'liveFeedDot online' : 'liveFeedDot'} aria-hidden /><div><strong>Live Trade Feed</strong><small>{primary} · {latency}</small></div></div>
      <div className="liveTradeFeedStats" aria-label="Trade feed summary">
        <div><span>B/S</span><strong>{summary?.buys ?? rows.filter((trade) => trade.side === 'buy').length}/{summary?.sells ?? rows.filter((trade) => trade.side === 'sell').length}</strong></div>
        <div><span>Buy</span><strong>{formatUsd(summary?.buyVolumeUsd)}</strong></div>
        <div><span>Sell</span><strong>{formatUsd(summary?.sellVolumeUsd)}</strong></div>
        <div><span>Net</span><strong>{formatUsd(summary?.netFlowUsd)}</strong></div>
      </div>
    </div>
    <div className="liveTradeFeedBody">
      <div className="terminalDataTable indexedTransactionsTable axiomTapeTable liveTradeFeedTable" role="table" aria-label="Indexed swaps">
        <div className="terminalDataRow terminalDataHead" role="row"><span>Age</span><span>Side</span><span>Size</span><span>USD</span><span>Price</span><span>Wallet</span><span>Tx</span></div>
        {rows.slice(0, 120).map((trade, index) => <div className={`terminalDataRow axiomTapeRow ${trade.side === 'buy' ? 'buyTransactionRow' : trade.side === 'sell' ? 'sellTransactionRow' : ''}`} role="row" key={`${trade.txHash}-${index}`}><span>{trade.age ?? compactAge(trade.timestamp)}</span><strong>{String(trade.side).toUpperCase()}</strong><span>{formatAmount(trade.amount)}</span><span>{formatUsd(trade.volumeUsd)}</span><span>{formatUsd(trade.priceUsd)}</span><span>{compactAddress(trade.wallet)}</span><span>{trade.txHash ? <a href={`https://solscan.io/tx/${trade.txHash}`} target="_blank" rel="noreferrer">↗</a> : '—'}</span></div>)}
        {shellMode && shellRows.map((index) => <div className={`terminalDataRow axiomTapeRow liveTradeFeedSkeletonRow ${index === 0 ? 'shellMessageRow' : ''}`} role="row" aria-hidden={index > 0} key={`trade-feed-shell-${index}`}><span>{index === 0 ? '—' : ''}</span><strong>{index === 0 ? (status === 'loading' ? 'Loading' : activeMint ? 'No swaps' : 'Scan') : ''}</strong><span>{index === 0 ? '—' : ''}</span><span>{index === 0 ? '—' : ''}</span><span>{index === 0 ? '—' : ''}</span><span>{index === 0 ? note : ''}</span><span>{index === 0 ? latency : ''}</span></div>)}
      </div>
    </div>
  </section>;
}
