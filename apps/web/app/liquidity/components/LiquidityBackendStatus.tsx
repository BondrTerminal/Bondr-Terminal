'use client';

import { useEffect, useState } from 'react';

type TerminalBackend = {
  status?: string;
  observedAt?: string;
  rpc?: { provider?: string; configured?: boolean; enhancedTransactions?: boolean };
  execution?: { liveTradingEnabled?: boolean; orderEngine?: Record<string, string>; walletOps?: { operations?: Record<string, { status?: string; note?: string }> }; deployment?: { engines?: Record<string, { status?: string; note?: string }> } };
  wallets?: { count?: number; liveBalanceCount?: number; totalSol?: number };
  liquidity?: { poolIndex?: { summary?: { pairCount?: number; liquidityUsd?: number; volume24h?: number } }; lpScanner?: { summary?: { poolsScanned?: number; lpMintsResolved?: number; unresolvedPools?: number } } };
};

function money(value?: number) {
  if (typeof value !== 'number') return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function LiquidityBackendStatus() {
  const [data, setData] = useState<TerminalBackend | null>(null);
  const [error, setError] = useState('');

  async function refresh() {
    setError('');
    try {
      const response = await fetch('/api/terminal-backend', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'terminal backend failed');
      setData(payload as TerminalBackend);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'terminal backend failed');
    }
  }

  useEffect(() => { void refresh(); }, []);

  const orderEngine = data?.execution?.orderEngine ?? {};
  return (
    <section className="documentCard liquidityBackendStatus">
      <div className="tablePanelHeader"><span>Backend hardwire status</span><strong>{data?.status ?? 'Loading'}</strong><button className="button secondary smallButton" type="button" onClick={() => void refresh()}>Refresh</button></div>
      {error && <p className="dangerText">{error}</p>}
      <div className="premiumTokenStats liquidityProbeStats">
        <div><span>RPC</span><strong>{data?.rpc?.provider ?? 'Loading'}</strong><small>{data?.rpc?.configured ? 'configured' : 'fallback/public'}</small></div>
        <div><span>Wallets</span><strong>{data?.wallets?.liveBalanceCount ?? 0}/{data?.wallets?.count ?? 0}</strong><small>{(data?.wallets?.totalSol ?? 0).toFixed(4)} SOL read</small></div>
        <div><span>Live gate</span><strong>{data?.execution?.liveTradingEnabled ? 'Enabled' : 'Disabled'}</strong><small>Browser-wallet signing required</small></div>
        <div><span>Pools</span><strong>{data?.liquidity?.poolIndex?.summary?.pairCount ?? 0}</strong><small>{money(data?.liquidity?.poolIndex?.summary?.liquidityUsd)} liquidity</small></div>
        <div><span>LP scanner</span><strong>{data?.liquidity?.lpScanner?.summary ? `${data.liquidity.lpScanner.summary.lpMintsResolved}/${data.liquidity.lpScanner.summary.poolsScanned}` : '0/0'}</strong><small>{data?.liquidity?.lpScanner?.summary?.unresolvedPools ?? 0} unresolved</small></div>
        <div><span>Swap route</span><strong>{orderEngine.marketSwap ?? 'Loading'}</strong><small>Jupiter builder state</small></div>
      </div>
      <div className="terminalDataTable tabRowsTable" role="table">
        <div className="terminalDataRow terminalDataHead" role="row"><span>Engine</span><span>State</span><span>Source</span></div>
        {Object.entries(orderEngine).map(([engine, state]) => <div className="terminalDataRow" role="row" key={engine}><strong>{engine}</strong><span>{state}</span><span>/api/terminal-backend</span></div>)}
      </div>
    </section>
  );
}
