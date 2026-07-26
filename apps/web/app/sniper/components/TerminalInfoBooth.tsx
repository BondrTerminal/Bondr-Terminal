'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TerminalHolderAccount, TerminalTokenSnapshot, TerminalTopTrader, TerminalTradeEvent } from '../../../lib/terminal/contracts';



type UiHolderRow = TerminalHolderAccount & {
  pctSupply?: number | null;
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
  lifecycleNote?: string | null;
  lastSeenAt?: string | null;
  tags?: string[];
};

type UiTopTrader = TerminalTopTrader & {
  boughtTokens?: number;
  soldTokens?: number;
  netTokens?: number;
  avgEntryUsd?: number | null;
  avgExitUsd?: number | null;
  totalPnlUsd?: number | null;
  holdDurationHours?: number | null;
  tags?: string[];
};

type UiPositionRow = {
  wallet: string;
  role?: string | null;
  uiAmount: number;
  valueUsd: number | null;
  avgEntryUsd: number | null;
  avgExitUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  totalPnlUsd: number | null;
  txCount: number | null;
  lastSeenAt: string | null;
  source: string[];
  status: string;
};

type SnapshotWithPositions = TerminalTokenSnapshot & { positions?: { rows?: UiPositionRow[]; summary?: Record<string, unknown> | null; source?: string } };

type TerminalWallet = {
  id: string;
  address: string;
  role: string;
  scope: string;
  balanceSol: number;
  purpose: string;
};

type Flow = {
  buysSol: number;
  sellsSol: number;
  netSol: number;
} | null;

type TerminalOrder = {
  id: string;
  createdAt: string;
  mint: string;
  wallet: string;
  side: 'buy' | 'sell';
  kind: 'market' | 'limit' | 'take-profit' | 'stop-loss';
  status: 'open' | 'triggered' | 'cancelled' | 'replaced' | 'expired' | 'error';
  amount: string;
  spendAsset: 'SOL' | 'USDC';
  triggerPriceUsd: number | null;
  triggerDirection: 'above' | 'below' | null;
  lifecycleStage?: string;
  lifecycle?: Array<{ stage?: string; at?: string; note?: string | null; priceUsd?: number | null; signature?: string | null }> | null;
  lastEvaluationAt?: string | null;
  lastObservedPriceUsd?: number | null;
  triggeredAt?: string | null;
  signature?: string | null;
};

type BackendWalletRow = TerminalWallet & { solBalance?: number; balanceStatus?: string; balanceNote?: string };
type BackendTokenRow = { id?: string | null; address?: string | null; role?: string | null; uiAmount?: number; rawAmount?: string };

type TerminalBackendShape = {
  execution?: {
    liveTradingEnabled?: boolean;
    orderEngine?: Record<string, string>;
    terminalOrders?: { orders?: TerminalOrder[]; execution?: string };
    bundleSequencer?: { execution?: string; reason?: string | null };
  };
  wallets?: {
    count?: number;
    totalSol?: number;
    tokenBalances?: { walletCount?: number; nonZeroWallets?: number; totalUiAmount?: number; rows?: BackendTokenRow[] };
    rows?: BackendWalletRow[];
  };
  bundle?: { selectedWalletCount?: number; solAvailable?: number; engineStatus?: string };
  accounting?: Flow;
};

type BundlePayload = { status?: string; execution?: string; reason?: string | null; error?: string; legs?: Array<Record<string, unknown>> };
type TradeTapeState = { status?: string; primary?: string; rows?: number; blockers?: string[]; optionalProviderGaps?: string[]; recommendedFixes?: string[]; latencyMs?: number | null; note?: string | null };

type Tab = (typeof tabs)[number];
const tabs = ['Transactions', 'Positions', 'Orders', 'Holders', 'Top Traders', 'Dev Tokens', 'Wallets', 'Bundle', 'Risk', 'Migration', 'Signals'] as const;
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function formatPct(value: number | null | undefined, fallback = 'API limited') {
  return typeof value === 'number' ? `${value.toFixed(2)}%` : fallback;
}

function formatCount(value: number | null | undefined, fallback = 'API limited') {
  return typeof value === 'number' ? value.toLocaleString() : fallback;
}

function formatUsd(value: number | null | undefined, fallback = '—') {
  return typeof value === 'number' && Number.isFinite(value) ? `$${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 0 : 2 })}` : fallback;
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

function compactAddress(address: string | null | undefined) {
  return address && ADDRESS_RE.test(address) ? `${address.slice(0, 6)}…${address.slice(-5)}` : '—';
}

function sourceValue(snapshot: TerminalTokenSnapshot | null, key: string) {
  const sources = snapshot?.sources as Record<string, unknown> | undefined;
  const value = sources?.[key];
  if (!value) return 'loading';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'source' in value) return String((value as { source?: unknown }).source ?? 'read');
  return 'read';
}

function asBackend(snapshot: TerminalTokenSnapshot | null): TerminalBackendShape | null {
  return (snapshot?.terminal ?? null) as TerminalBackendShape | null;
}

function rowsFromClassifier(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object') return [];
  const object = value as { rows?: Array<Record<string, unknown>>; wallets?: Array<Record<string, unknown>>; clusters?: Array<Record<string, unknown>> };
  return object.rows ?? object.wallets ?? object.clusters ?? [];
}

export function TerminalInfoBooth({ wallets, flow, mint, projectId }: { wallets: TerminalWallet[]; flow: Flow; mint?: string; projectId?: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('Transactions');
  const [selectedWalletId, setSelectedWalletId] = useState(wallets[0]?.id ?? '');
  const [bundleWalletIds, setBundleWalletIds] = useState(() => wallets.slice(0, Math.min(4, wallets.length)).map((wallet) => wallet.id));
  const [activeMint, setActiveMint] = useState(mint ?? '');
  const [snapshot, setSnapshot] = useState<TerminalTokenSnapshot | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState('idle');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [tabActionMessage, setTabActionMessage] = useState<string | null>(null);
  const [tabActionLoading, setTabActionLoading] = useState(false);

  useEffect(() => setActiveMint(mint ?? ''), [mint]);

  useEffect(() => {
    function onTokenLoaded(event: Event) {
      const custom = event as CustomEvent<{ mint?: string }>;
      if (custom.detail?.mint) setActiveMint(custom.detail.mint);
    }
    function onRefresh() {
      setRefreshNonce((value) => value + 1);
    }
    window.addEventListener('meridian-token-loaded', onTokenLoaded);
    window.addEventListener('meridian-terminal-refresh', onRefresh);
    return () => {
      window.removeEventListener('meridian-token-loaded', onTokenLoaded);
      window.removeEventListener('meridian-terminal-refresh', onRefresh);
    };
  }, []);

  useEffect(() => {
    if (!activeMint) {
      setSnapshot(null);
      setSnapshotStatus('waiting-for-token');
      return;
    }

    const devWallets = wallets.map((wallet) => wallet.address).join(',');
    const query = new URLSearchParams({ mint: activeMint, holderLimit: '25', limit: '30', profile: 'prototype' });
    if (projectId) query.set('project', projectId);
    if (devWallets) query.set('devWallets', devWallets);

    const controller = new AbortController();
    setSnapshotStatus('syncing');

    void fetch(`/api/terminal/snapshot?${query.toString()}`, { signal: controller.signal, cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`snapshot ${response.status}`)))
      .then((payload) => {
        setSnapshot(payload as TerminalTokenSnapshot);
        setSnapshotStatus('synced');
      })
      .catch((error) => {
        if (!controller.signal.aborted) setSnapshotStatus(error instanceof Error ? error.message : 'snapshot failed');
      });

    const stream = new EventSource(`/api/terminal/stream?${query.toString()}&intervalMs=5000`);
    stream.addEventListener('open', () => setSnapshotStatus('stream-connected'));
    stream.addEventListener('snapshot', (event) => {
      try {
        setSnapshot(JSON.parse((event as MessageEvent).data) as TerminalTokenSnapshot);
        setSnapshotStatus('live');
      } catch {
        setSnapshotStatus('stream-parse-error');
      }
    });
    stream.addEventListener('partial', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as TerminalTokenSnapshot;
        setSnapshot(payload);
        setSnapshotStatus('stream-partial');
      } catch {
        setSnapshotStatus('stream-partial');
      }
    });
    stream.addEventListener('heartbeat', () => setSnapshotStatus('stream-connected'));
    stream.addEventListener('end', () => setSnapshotStatus('stream-reconnecting'));
    stream.addEventListener('error', () => setSnapshotStatus('stream-reconnecting'));

    return () => {
      controller.abort();
      stream.close();
    };
  }, [activeMint, projectId, refreshNonce, wallets]);

  const backend = asBackend(snapshot);
  const backendWallets = backend?.wallets?.rows;
  const renderedWallets = backendWallets?.length
    ? backendWallets.map((wallet) => ({ ...wallet, balanceSol: wallet.solBalance ?? wallet.balanceSol ?? 0, scope: wallet.scope ?? 'global' })) as TerminalWallet[]
    : wallets;
  const selectedWallet = renderedWallets.find((wallet) => wallet.id === selectedWalletId) ?? renderedWallets[0];
  const bundleWallets = useMemo(() => renderedWallets.filter((wallet) => bundleWalletIds.includes(wallet.id)), [renderedWallets, bundleWalletIds]);
  const tokenRows = backend?.wallets?.tokenBalances?.rows ?? [];
  const orders = (snapshot?.orders as { orders?: TerminalOrder[] } | null)?.orders ?? backend?.execution?.terminalOrders?.orders ?? [];
  const positionRows = (snapshot as SnapshotWithPositions | null)?.positions?.rows ?? [];
  const trades = snapshot?.trades?.rows ?? [];
  const tradeTape = ((snapshot as (TerminalTokenSnapshot & { tradeTape?: TradeTapeState }) | null)?.tradeTape ?? (snapshot?.trades as { tradeTape?: TradeTapeState } | undefined)?.tradeTape ?? null) as TradeTapeState | null;
  const topTraders = (snapshot?.trades?.topTraders ?? []) as UiTopTrader[];
  const holders = snapshot?.holders;
  const holderRows = (holders?.rows ?? []) as UiHolderRow[];
  const holderValuedRows = holderRows.filter((row) => typeof row.valueUsd === 'number').length;
  const holderPnlRows = holderRows.filter((row) => row.pnlStatus === 'trade-tape-estimate').length;
  const traderPnlRows = topTraders.filter((row) => typeof row.totalPnlUsd === 'number').length;
  const freshRows = rowsFromClassifier(snapshot?.freshWallets);
  const bundleRows = rowsFromClassifier(snapshot?.bundles);
  const devRows = (snapshot?.devTokens?.wallets ?? []) as Array<Record<string, unknown>>;
  const poolSummary = (snapshot?.pool as { summary?: Record<string, unknown> } | null)?.summary;
  const pumpfun = (snapshot as (TerminalTokenSnapshot & { pumpfun?: { token?: Record<string, unknown>; migrations?: { migrations?: Array<Record<string, unknown>>; status?: string; note?: string | null; authConfigured?: boolean }; devTokens?: { tokens?: Array<Record<string, unknown>>; status?: string; note?: string | null; authConfigured?: boolean } } }) | null)?.pumpfun;
  const pumpfunDevTokens = pumpfun?.devTokens?.tokens ?? [];
  const pumpfunMigrations = pumpfun?.migrations?.migrations ?? [];
  const sources = snapshot?.sources as Record<string, unknown> | undefined;

  function toggleBundleWallet(walletId: string) {
    setBundleWalletIds((current) => current.includes(walletId) ? current.filter((id) => id !== walletId) : [...current, walletId]);
  }

  async function refreshTerminalTabs() {
    setRefreshNonce((value) => value + 1);
  }

  async function evaluateOrders() {
    if (!activeMint || tabActionLoading) return;
    setTabActionLoading(true);
    setTabActionMessage(null);
    try {
      const response = await fetch('/api/routers/order/evaluate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mint: activeMint })
      });
      const payload = await response.json() as { error?: string; evaluated?: unknown[]; triggered?: unknown[]; execution?: string; router?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Order evaluation failed.');
      setTabActionMessage(`Order monitor · ${payload.evaluated?.length ?? 0} checked · ${payload.triggered?.length ?? 0} triggered`);
      await refreshTerminalTabs();
    } catch (error) {
      setTabActionMessage(error instanceof Error ? error.message : 'Order evaluation failed.');
    } finally {
      setTabActionLoading(false);
    }
  }

  async function cancelOrder(id: string) {
    if (tabActionLoading) return;
    setTabActionLoading(true);
    setTabActionMessage(null);
    try {
      const response = await fetch('/api/terminal-order-engine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', id })
      });
      const payload = await response.json() as { error?: string; execution?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Cancel failed.');
      setTabActionMessage(payload.execution ?? 'order-cancelled');
      await refreshTerminalTabs();
    } catch (error) {
      setTabActionMessage(error instanceof Error ? error.message : 'Cancel failed.');
    } finally {
      setTabActionLoading(false);
    }
  }

  async function preflightSelectedBundle() {
    if (!activeMint || tabActionLoading) return;
    setTabActionLoading(true);
    setTabActionMessage(null);
    try {
      const legs = bundleWallets.map((wallet) => ({ wallet: wallet.address, side: 'Buy', amount: '0.01', spendAsset: 'SOL', slippageBps: 100 }));
      const response = await fetch('/api/routers/bundle/preflight', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mint: activeMint, legs })
      });
      const payload = await response.json() as BundlePayload;
      if (!response.ok && response.status !== 403) throw new Error(payload.error ?? 'Bundle preflight failed.');
      setTabActionMessage(`Bundle check · ${payload.reason ?? `${payload.legs?.length ?? legs.length} legs ready`}`);
      await refreshTerminalTabs();
    } catch (error) {
      setTabActionMessage(error instanceof Error ? error.message : 'Bundle preflight failed.');
    } finally {
      setTabActionLoading(false);
    }
  }

  const openOrders = orders.filter((order) => order.status === 'open');
  const triggeredOrders = orders.filter((order) => order.status === 'triggered');
  const tokenInventory = backend?.wallets?.tokenBalances;
  const sourceRows = [
    ['Market data', snapshot?.execution ?? snapshotStatus, 'Terminal snapshot'],
    ['Live stream', snapshotStatus, 'Realtime updates'],
    ['Pool age', String((sources?.poolAge as { source?: string; firstSeenAt?: string } | undefined)?.source ?? 'loading'), String((sources?.poolAge as { firstSeenAt?: string } | undefined)?.firstSeenAt ?? 'waiting')],
    ['Trade tape', sourceValue(snapshot, 'tradeTape'), 'Indexed swaps'],
    ['Holders', String(holders?.source ?? sourceValue(snapshot, 'holders')), 'Wallet ownership'],
    ['Fresh/snipers', sourceValue(snapshot, 'fresh'), 'Wallet classifier'],
    ['Bundles', sourceValue(snapshot, 'bundles'), 'Slot clustering'],
    ['Dev sold', sourceValue(snapshot, 'devSold'), 'Team wallet flow']
  ];

  return (
    <section className="terminalInfoBooth" data-contract="terminal-snapshot-v1">
      <div className="terminalMarketViewer" data-hardwire="terminal-bottom-tabs" aria-label="Terminal market viewer">
        <div className="terminalMarketHeader">
          <div className="terminalMarketTitle"><span>Meridian Terminal</span><strong>Live Market</strong><small>{activeMint ? compactAddress(activeMint) : 'Load a token'} · {activeTab}</small></div>
          <div className={snapshotStatus === 'live' || snapshotStatus === 'stream-connected' ? 'terminalSyncBadge synced' : snapshotStatus === 'stream-partial' ? 'terminalSyncBadge partial' : 'terminalSyncBadge syncing'}>{snapshotStatus === 'live' || snapshotStatus === 'stream-connected' ? 'Live' : snapshotStatus === 'stream-partial' ? 'Partial' : snapshotStatus.includes('reconnecting') || snapshotStatus.includes('error') ? 'Reconnecting' : snapshot ? 'Synced' : 'Syncing'}</div>
        </div>

        <div className="terminalMarketStats">
          <div><span>Trades</span><strong>{trades.length}</strong><small>market tape</small></div>
          <div><span>Holders</span><strong>{holderRows.length}</strong><small>wallet list</small></div>
          <div><span>Orders</span><strong>{orders.length}</strong><small>{openOrders.length} open · {triggeredOrders.length} triggered</small></div>
          <div><span>Wallet</span><strong>{selectedWallet ? selectedWallet.role : 'None'}</strong><small>{selectedWallet ? `${compactAddress(selectedWallet.address)} · ${selectedWallet.balanceSol.toFixed(4)} SOL` : 'Select wallet'}</small></div>
          <div><span>Execution</span><strong>{backend?.execution?.liveTradingEnabled ? 'Live' : 'Gated'}</strong><small>signer required</small></div>
        </div>
      </div>
      {tabActionMessage && <div className="terminalActionMessage">{tabActionMessage}</div>}

      <div className="terminalTabBar marketViewerTabs" role="tablist" aria-label="Trading terminal information tabs">
        {tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'activeTerminalTab' : ''} onClick={() => setActiveTab(tab)} key={tab}>{tab}</button>)}
      </div>

      <div className="terminalTabPanel">
        {activeTab === 'Transactions' && <TradeTable trades={trades} tradeTape={tradeTape} />}
        {activeTab === 'Positions' && <PositionsPanel wallets={renderedWallets} tokenRows={tokenRows} positionRows={positionRows} positionSummary={(snapshot as SnapshotWithPositions | null)?.positions?.summary ?? null} tokenInventory={tokenInventory} flow={backend?.accounting ?? flow} mint={activeMint} />}
        {activeTab === 'Orders' && <OrdersPanel orders={orders} openCount={openOrders.length} triggeredCount={triggeredOrders.length} execution={backend?.execution?.terminalOrders?.execution} onEvaluate={() => void evaluateOrders()} onCancel={(id) => void cancelOrder(id)} loading={tabActionLoading} />}
        {activeTab === 'Holders' && <HoldersPanel holders={holders} rows={holderRows} />}
        {activeTab === 'Top Traders' && <TopTradersPanel rows={topTraders} fallbackTrades={trades} />}
        {activeTab === 'Dev Tokens' && <DevTokensPanel rows={devRows} tokenRows={tokenRows} pumpfunTokens={pumpfunDevTokens} pumpfunStatus={pumpfun?.devTokens?.status ?? 'loading'} pumpfunToken={pumpfun?.token} devSource={sourceValue(snapshot, 'devSold')} />}
        {activeTab === 'Wallets' && <WalletsPanel wallets={renderedWallets} selectedWalletId={selectedWallet?.id ?? ''} bundleWalletIds={bundleWalletIds} tokenRows={tokenRows} onSelect={setSelectedWalletId} onToggleBundle={toggleBundleWallet} onOpenPositions={() => setActiveTab('Positions')} />}
        {activeTab === 'Bundle' && <BundlePanel wallets={bundleWallets} bundleRows={bundleRows} execution={backend?.execution?.bundleSequencer?.execution ?? backend?.bundle?.engineStatus} onPreflight={() => void preflightSelectedBundle()} loading={!activeMint || !bundleWallets.length || tabActionLoading} />}
        {activeTab === 'Risk' && <RowsTable head={['Source', 'Status', 'Route']} rows={sourceRows} />}
        {activeTab === 'Migration' && <MigrationPanel poolSummary={poolSummary} pumpfunToken={pumpfun?.token} pumpfunMigrations={pumpfunMigrations} pumpfunMigrationStatus={pumpfun?.migrations?.status ?? 'loading'} bundleWalletCount={bundleWallets.length} />}
        {activeTab === 'Signals' && <SignalsPanel freshRows={freshRows} bundleRows={bundleRows} topTraders={topTraders} holderRows={holderRows} holderValuedRows={holderValuedRows} holderPnlRows={holderPnlRows} traderPnlRows={traderPnlRows} pumpfunRows={String((snapshot?.trades?.summary as Record<string, unknown> | null)?.pumpfunRows ?? (pumpfun?.token ? 'token-read' : 'loading'))} liquidityUsd={poolSummary?.liquidityUsd} sourceFresh={sourceValue(snapshot, 'fresh')} sourceBundles={sourceValue(snapshot, 'bundles')} />}
      </div>
    </section>
  );
}

function TradeTable({ trades, tradeTape }: { trades: TerminalTradeEvent[]; tradeTape?: TradeTapeState | null }) {
  const blocker = tradeTape?.blockers?.[0] ?? tradeTape?.optionalProviderGaps?.[0] ?? tradeTape?.note ?? 'No recent trade rows from current providers. Add Helius/Birdeye or load a more active token.';
  const recommendedFix = tradeTape?.recommendedFixes?.[0] ?? 'Add Helius or Birdeye for wallet-attributed trade tape; use an active memecoin mint instead of USDC for tape testing.';
  const provider = tradeTape?.primary && tradeTape.primary !== 'none' ? tradeTape.primary : 'no active trade-tape provider';
  const latency = typeof tradeTape?.latencyMs === 'number' ? `${tradeTape.latencyMs}ms` : 'latency n/a';
  return (
    <div className="terminalDataTable indexedTransactionsTable" role="table" aria-label="Indexed transactions from terminal snapshot">
      <div className="terminalDataRow terminalDataHead" role="row"><span>Time</span><span>Side</span><span>Wallet</span><span>Amount</span><span>Price</span><span>Volume</span><span>Tx</span></div>
      {trades.map((trade, index) => <div className={`terminalDataRow ${trade.side === 'buy' ? 'buyTransactionRow' : trade.side === 'sell' ? 'sellTransactionRow' : ''}`} role="row" key={`${trade.txHash}-${index}`}><span>{trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString() : '—'}</span><strong>{trade.side}</strong><span>{compactAddress(trade.wallet)}</span><span>{trade.amount ? Number(trade.amount).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}</span><span>{trade.priceUsd ? `$${Number(trade.priceUsd).toPrecision(5)}` : '—'}</span><span>{trade.volumeUsd ? `$${Number(trade.volumeUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</span><span>{trade.txHash ? <a href={`https://solscan.io/tx/${trade.txHash}`} target="_blank" rel="noreferrer">Open</a> : '—'}</span></div>)}
      {trades.length === 0 && <div className="terminalDataRow" role="row"><strong>No trade rows</strong><span>{provider} · {latency}</span><span>No recent trade rows from current providers. Add Helius/Birdeye or load a more active token.</span><span>{blocker} · {recommendedFix}</span></div>}
    </div>
  );
}

function PositionsPanel({ wallets, tokenRows, positionRows, positionSummary, tokenInventory, flow, mint }: { wallets: TerminalWallet[]; tokenRows: BackendTokenRow[]; positionRows: UiPositionRow[]; positionSummary: Record<string, unknown> | null; tokenInventory?: TerminalBackendShape['wallets'] extends infer W ? W extends { tokenBalances?: infer T } ? T : never : never; flow: Flow; mint: string }) {
  const rows = positionRows.length ? positionRows : wallets.map((wallet) => { const tokenRow = tokenRows.find((row) => row.id === wallet.id || row.address === wallet.address); return { wallet: wallet.address, role: wallet.role, uiAmount: tokenRow?.uiAmount ?? 0, valueUsd: null, avgEntryUsd: null, avgExitUsd: null, realizedPnlUsd: null, unrealizedPnlUsd: null, totalPnlUsd: null, txCount: null, lastSeenAt: null, source: ['wallet-token-balances'], status: 'balance-only' } satisfies UiPositionRow; });
  return <div className="positionsTabSurface"><div className="positionSummaryGrid tabInfoGrid"><div><span>SOL spent</span><strong>{flow ? `${flow.buysSol.toFixed(2)} SOL` : '0.00 SOL'}</strong><small>Snapshot accounting.</small></div><div><span>Portfolio value</span><strong>{formatUsd(typeof positionSummary?.totalValueUsd === 'number' ? positionSummary.totalValueUsd : null)}</strong><small>{String(positionSummary?.valuedWallets ?? 0)} valued wallets.</small></div><div><span>Position PnL</span><strong>{formatUsd(typeof positionSummary?.totalPnlUsd === 'number' ? positionSummary.totalPnlUsd : null, 'need tape')}</strong><small>{String(positionSummary?.pnlWallets ?? 0)} wallets with trade tape.</small></div><div><span>Token inventory</span><strong>{mint ? `${tokenInventory?.nonZeroWallets ?? 0}/${tokenInventory?.walletCount ?? wallets.length} wallets` : 'Load token first'}</strong><small>{(tokenInventory?.totalUiAmount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} tokens</small></div></div>{mint && <div className="terminalDataTable positionIntelTable" role="table" aria-label="Token positions by wallet"><div className="terminalDataRow terminalDataHead" role="row"><span>Wallet</span><span>Role</span><span>Amount</span><span>Value</span><span>Entry</span><span>Exit</span><span>Realized</span><span>Unrealized</span><span>Total PnL</span><span>Txs</span><span>Status</span></div>{rows.map((row, index) => { const pnl = row.totalPnlUsd; const pnlClass = typeof pnl === 'number' ? pnl >= 0 ? 'positivePnlCell' : 'negativePnlCell' : ''; return <div className="terminalDataRow" role="row" key={`position-${row.wallet || index}`}><strong>{compactAddress(row.wallet)}</strong><span>{row.role ?? 'wallet'}</span><span>{formatTokenAmount(row.uiAmount)}</span><span>{formatUsd(row.valueUsd)}</span><span>{formatUsd(row.avgEntryUsd)}</span><span>{formatUsd(row.avgExitUsd)}</span><span>{formatUsd(row.realizedPnlUsd)}</span><span>{formatUsd(row.unrealizedPnlUsd)}</span><span className={pnlClass}>{formatUsd(row.totalPnlUsd, row.status.includes('estimate') ? '—' : 'need tape')}</span><span>{row.txCount ?? '—'}</span><span>{row.status}</span></div>; })}</div>}</div>;
}

function OrdersPanel({ orders, openCount, triggeredCount, execution, onEvaluate, onCancel, loading }: { orders: TerminalOrder[]; openCount: number; triggeredCount: number; execution?: string; onEvaluate: () => void; onCancel: (id: string) => void; loading: boolean }) {
  return <div className="ordersTabSurface"><div className="terminalTabActionBar"><strong>Order monitor</strong><span>{execution ?? `${openCount} open · ${triggeredCount} triggered`}</span><button type="button" onClick={onEvaluate} disabled={loading}>Evaluate orders</button></div>{orders.length > 0 ? <div className="terminalDataTable terminalOrdersLifecycleTable" role="table" aria-label="Terminal order lifecycle from snapshot"><div className="terminalDataRow terminalDataHead" role="row"><span>Created</span><span>Side</span><span>Kind</span><span>Amount</span><span>Trigger</span><span>Observed</span><span>Status</span><span>Stage</span><span>Last event</span><span>Tx</span><span>Actions</span></div>{orders.map((order) => { const lastEvent = order.lifecycle && order.lifecycle.length ? order.lifecycle[order.lifecycle.length - 1] : undefined; return <div className={`terminalDataRow orderStatus-${order.status}`} role="row" key={order.id}><span>{new Date(order.createdAt).toLocaleTimeString()}</span><strong>{order.side}</strong><span>{order.kind}</span><span>{order.amount} {order.spendAsset}</span><span>{order.triggerPriceUsd ? `${order.triggerDirection ?? ''} $${order.triggerPriceUsd}` : 'market'}</span><span>{typeof order.lastObservedPriceUsd === 'number' ? `$${order.lastObservedPriceUsd.toPrecision(5)}` : 'not evaluated'}</span><span>{order.status}</span><span>{order.lifecycleStage ?? 'created'}</span><span>{lastEvent?.note ?? (order.lastEvaluationAt ? `evaluated ${new Date(order.lastEvaluationAt).toLocaleTimeString()}` : 'created')}</span><span>{order.signature ? <a href={`https://solscan.io/tx/${order.signature}`} target="_blank" rel="noreferrer">Open</a> : 'not built'}</span><div className="terminalRowActions"><button type="button" onClick={() => onCancel(order.id)} disabled={order.status !== 'open' || loading}>Cancel</button></div></div>; })}</div> : <RowsTable head={['Metric', 'Value', 'Source']} rows={[[ 'Open orders', String(openCount), 'Order book' ], [ 'Triggered orders', String(triggeredCount), 'Execution queue' ], [ 'Lifecycle', 'created → evaluated → triggered → built → signed → sent → confirmed/failed', 'Order monitor' ], [ 'Evaluation', execution ?? 'ready', 'Live checks' ]]} />}</div>;
}

function HoldersPanel({ holders, rows }: { holders: TerminalTokenSnapshot['holders']; rows: UiHolderRow[] }) {
  return <div className="holdersTabSurface"><div className="terminalDataTable holderAccountsTable holderIntelTable" role="table" aria-label="Token holders enriched with wallet analytics"><div className="terminalDataRow terminalDataHead" role="row"><span>#</span><span>Wallet</span><span>SOL</span><span>Holding</span><span>%</span><span>Value</span><span>Bought</span><span>Sold</span><span>Entry</span><span>Exit</span><span>PnL</span><span>Last active</span><span>Tags</span></div>{rows.map((row, index) => { const pnl = row.totalPnlUsd; const pnlClass = typeof pnl === 'number' ? pnl >= 0 ? 'positivePnlCell' : 'negativePnlCell' : ''; const partialLabel = row.lifecycleStatus === 'not-configured' ? 'Need Helius' : row.lifecycleStatus === 'empty' ? 'No sampled flow' : 'Partial history'; return <div className="terminalDataRow holderIntelRow" role="row" key={row.tokenAccount}><span>{row.rank ?? index + 1}</span><strong><a href={row.owner ? `https://solscan.io/account/${row.owner}` : undefined} target="_blank" rel="noreferrer">{compactAddress(row.owner)}</a><small>{compactAddress(row.tokenAccount)}</small></strong><span>{typeof row.ownerSolBalance === 'number' ? `${row.ownerSolBalance.toFixed(3)} SOL` : '—'}</span><span>{formatTokenAmount(row.uiAmount)}</span><span>{formatPct(row.pctSupply, '—')}</span><span>{formatUsd(row.valueUsd)}</span><span>{formatTokenAmount(row.boughtTokens, partialLabel)}</span><span>{formatTokenAmount(row.soldTokens, partialLabel)}</span><span>{formatPriceOrTime(row.avgEntryUsd, row.entryAt, partialLabel)}</span><span>{formatPriceOrTime(row.avgExitUsd, row.exitAt, partialLabel)}</span><span className={pnlClass}>{formatUsd(row.totalPnlUsd, row.pnlStatus === 'trade-tape-needed' ? partialLabel : '—')}</span><span>{formatDateTime(row.lastSeenAt)}</span><span>{row.tags?.length ? row.tags.join(' · ') : row.lifecycleSource ?? row.pnlStatus ?? 'balance-only'}</span></div>; })}{rows.length === 0 && <div className="terminalDataRow" role="row"><strong>No holder rows</strong><span>{holders?.status ?? 'loading'}</span><span>Load an active token or connect a richer holder source.</span><span>—</span></div>}</div></div>;
}

function TopTradersPanel({ rows, fallbackTrades }: { rows: UiTopTrader[]; fallbackTrades: TerminalTradeEvent[] }) {
  const fallback = Array.from(fallbackTrades.reduce((map, trade) => { if (!trade.wallet) return map; const row = map.get(trade.wallet) ?? { wallet: trade.wallet, buys: 0, sells: 0, boughtTokens: 0, soldTokens: 0, netTokens: 0, buyVolumeUsd: 0, sellVolumeUsd: 0, totalVolumeUsd: 0, netVolumeUsd: 0, avgEntryUsd: null, avgExitUsd: null, realizedPnlUsd: null, unrealizedPnlUsd: null, totalPnlUsd: null, txCount: 0, firstSeenAt: null, lastTx: null as string | null, lastSeenAt: null, holdDurationHours: null, sources: [] as string[], tags: [] as string[] }; const amount = Number(trade.amount ?? 0) || 0; const volume = Number(trade.volumeUsd ?? 0) || 0; if (trade.side === 'buy') { row.buys += 1; row.boughtTokens += amount; row.buyVolumeUsd += volume; } if (trade.side === 'sell') { row.sells += 1; row.soldTokens += amount; row.sellVolumeUsd += volume; } row.netTokens = row.boughtTokens - row.soldTokens; row.netVolumeUsd = row.buyVolumeUsd - row.sellVolumeUsd; row.totalVolumeUsd += volume; row.txCount += 1; row.lastTx = trade.txHash ?? row.lastTx; row.lastSeenAt = trade.timestamp ?? row.lastSeenAt; map.set(trade.wallet, row); return map; }, new Map<string, UiTopTrader>()).values());
  const rendered = rows.length ? rows : fallback;
  return <div className="topTradersTabSurface"><RowsTable head={['Metric', 'Value', 'Source']} rows={[[ 'Trader wallets', String(rendered.length), 'Ranked wallets' ], [ 'Matched trades', String(fallbackTrades.length), 'Market tape' ], [ 'PnL model', 'entry/exit from trades', 'Trade history' ]]} /><div className="terminalDataTable topTradersTable traderIntelTable" role="table" aria-label="Top traders from snapshot"><div className="terminalDataRow terminalDataHead" role="row"><span>Wallet</span><span>Txs</span><span>Buys/Sells</span><span>Buy vol</span><span>Sell vol</span><span>Net tokens</span><span>Entry</span><span>Exit</span><span>PnL</span><span>Hold window</span><span>Last tx</span><span>Tags</span></div>{rendered.map((row) => { const pnl = row.totalPnlUsd; const pnlClass = typeof pnl === 'number' ? pnl >= 0 ? 'positivePnlCell' : 'negativePnlCell' : ''; return <div className="terminalDataRow traderIntelRow" role="row" key={row.wallet}><strong><a href={`https://solscan.io/account/${row.wallet}`} target="_blank" rel="noreferrer">{compactAddress(row.wallet)}</a></strong><span>{row.txCount}</span><span>{row.buys}/{row.sells}</span><span>{formatUsd(row.buyVolumeUsd, 'amount-only')}</span><span>{formatUsd(row.sellVolumeUsd, 'amount-only')}</span><span>{formatTokenAmount(row.netTokens)}</span><span>{formatUsd(row.avgEntryUsd)}</span><span>{formatUsd(row.avgExitUsd)}</span><span className={pnlClass}>{formatUsd(row.totalPnlUsd, 'need tape')}</span><span>{typeof row.holdDurationHours === 'number' ? `${row.holdDurationHours}h` : '—'}</span><span>{row.lastTx ? <a href={`https://solscan.io/tx/${row.lastTx}`} target="_blank" rel="noreferrer">Open</a> : '—'}</span><span>{row.tags?.length ? row.tags.join(' · ') : row.sources?.join(' · ') || 'trade-tape'}</span></div>; })}{rendered.length === 0 && <div className="terminalDataRow" role="row"><strong>No trader rows</strong><span>Top traders</span><span>Waiting for trade history</span><span>—</span></div>}</div></div>;
}

function DevTokensPanel({ rows, tokenRows, pumpfunTokens, pumpfunStatus, pumpfunToken, devSource }: { rows: Array<Record<string, unknown>>; tokenRows: BackendTokenRow[]; pumpfunTokens: Array<Record<string, unknown>>; pumpfunStatus: string; pumpfunToken?: Record<string, unknown>; devSource: string }) {
  const creator = String(pumpfunToken?.creator ?? '');
  const migration = (pumpfunToken?.migration ?? {}) as Record<string, unknown>;
  return <div className="devTokensTabSurface"><RowsTable head={['Metric', 'Value', 'Source']} rows={[[ 'Creator', creator ? compactAddress(creator) : 'not returned', 'Pump.fun token profile' ], [ 'Dev sold rows', String(rows.length), devSource ], [ 'Pump.fun creator tokens', `${pumpfunTokens.length} rows · ${pumpfunStatus}`, 'Creator history' ], [ 'Current migration', migration.complete ? 'complete' : 'not complete / unknown', String(migration.raydiumPool ?? 'Pump.fun metadata') ]]} /><div className="terminalDataTable devWalletIntelTable" role="table" aria-label="Dev wallet token status"><div className="terminalDataRow terminalDataHead" role="row"><span>Wallet</span><span>Holding</span><span>Incoming</span><span>Outgoing</span><span>Sold</span><span>Provider</span><span>Last out</span></div>{rows.map((row, index) => { const wallet = String(row.wallet ?? row.address ?? ''); const tokenRow = tokenRows.find((token) => token.address === wallet); const outgoing = Array.isArray(row.outgoing) ? row.outgoing[0] as Record<string, unknown> | undefined : undefined; return <div className="terminalDataRow" role="row" key={`dev-${wallet || index}`}><strong>{compactAddress(wallet)}</strong><span>{formatTokenAmount(tokenRow?.uiAmount ?? Number(row.amount ?? 0))}</span><span>{formatTokenAmount(typeof row.incomingAmount === 'number' ? row.incomingAmount : null)}</span><span>{formatTokenAmount(typeof row.outgoingAmount === 'number' ? row.outgoingAmount : null)}</span><span>{row.soldLikely ? 'yes' : 'not seen'}</span><span>{String(row.providerStatus ?? row.source ?? devSource)}</span><span>{outgoing?.signature ? <a href={`https://solscan.io/tx/${String(outgoing.signature)}`} target="_blank" rel="noreferrer">{compactAddress(String(outgoing.signature))}</a> : '—'}</span></div>; })}{rows.length === 0 && <div className="terminalDataRow" role="row"><strong>No dev wallet rows</strong><span>{devSource}</span><span>Add team wallets to monitor movement.</span><span>—</span></div>}</div><div className="terminalDataTable pumpfunCreatorTokenTable" role="table" aria-label="Pump.fun creator token history"><div className="terminalDataRow terminalDataHead" role="row"><span>Mint</span><span>Name</span><span>Symbol</span><span>Market cap</span><span>Migration</span><span>Created</span><span>Source</span></div>{pumpfunTokens.slice(0, 30).map((token, index) => { const mint = String(token.mint ?? token.address ?? token.ca ?? ''); const complete = Boolean(token.complete ?? token.graduated ?? token.raydium_pool); return <div className="terminalDataRow" role="row" key={`pump-token-${mint || index}`}><strong>{mint ? compactAddress(mint) : `creator token ${index + 1}`}</strong><span>{String(token.name ?? '—')}</span><span>{String(token.symbol ?? token.ticker ?? '—')}</span><span>{formatUsd(typeof token.usd_market_cap === 'number' ? token.usd_market_cap : typeof token.market_cap === 'number' ? token.market_cap : null)}</span><span>{complete ? 'migrated' : 'bonding'}</span><span>{String(token.created_timestamp ?? token.createdAt ?? token.created_at ?? '—')}</span><span>pumpfun</span></div>; })}{pumpfunTokens.length === 0 && <div className="terminalDataRow" role="row"><strong>No creator tokens</strong><span>{pumpfunStatus}</span><span>No creator history loaded.</span><span>—</span></div>}</div></div>;
}

function MigrationPanel({ poolSummary, pumpfunToken, pumpfunMigrations, pumpfunMigrationStatus, bundleWalletCount }: { poolSummary?: Record<string, unknown>; pumpfunToken?: Record<string, unknown>; pumpfunMigrations: Array<Record<string, unknown>>; pumpfunMigrationStatus: string; bundleWalletCount: number }) {
  const migration = (pumpfunToken?.migration ?? {}) as Record<string, unknown>;
  return <div className="migrationIntelSurface"><RowsTable head={['Metric', 'Value', 'Source']} rows={[[ 'Pool age', String(poolSummary?.firstSeenAt ?? poolSummary?.pairCreatedAt ?? 'waiting'), String(poolSummary?.poolAgeSource ?? 'pool-index') ], [ 'Best venue', String(poolSummary?.bestDex ?? 'loading'), 'Pool index' ], [ 'Current migration', migration.complete ? 'complete' : 'not complete / unknown', 'Pump.fun token profile' ], [ 'Raydium pool', String(migration.raydiumPool ?? poolSummary?.bestPairAddress ?? 'not returned'), 'Pump.fun / DexScreener' ], [ 'Bundle on migration', `${bundleWalletCount} wallets`, 'Bundle preflight' ]]} /><div className="terminalDataTable migrationIntelTable" role="table" aria-label="Pump.fun migration rows"><div className="terminalDataRow terminalDataHead" role="row"><span>Mint</span><span>Name</span><span>Symbol</span><span>Market cap</span><span>Pool</span><span>Created</span><span>Status</span></div>{pumpfunMigrations.slice(0, 30).map((token, index) => { const mint = String(token.mint ?? token.address ?? token.ca ?? ''); return <div className="terminalDataRow" role="row" key={`migration-${mint || index}`}><strong>{mint ? compactAddress(mint) : `migration ${index + 1}`}</strong><span>{String(token.name ?? '—')}</span><span>{String(token.symbol ?? token.ticker ?? '—')}</span><span>{formatUsd(typeof token.usd_market_cap === 'number' ? token.usd_market_cap : typeof token.market_cap === 'number' ? token.market_cap : null)}</span><span>{compactAddress(String(token.raydium_pool ?? token.raydiumPool ?? token.pool ?? ''))}</span><span>{String(token.created_timestamp ?? token.createdAt ?? token.created_at ?? '—')}</span><span>{String(token.complete ?? token.graduated ?? 'migrated')}</span></div>; })}{pumpfunMigrations.length === 0 && <div className="terminalDataRow" role="row"><strong>No migration rows</strong><span>{pumpfunMigrationStatus}</span><span>No migration feed loaded.</span><span>—</span></div>}</div></div>;
}

function WalletsPanel({ wallets, selectedWalletId, bundleWalletIds, tokenRows, onSelect, onToggleBundle, onOpenPositions }: { wallets: TerminalWallet[]; selectedWalletId: string; bundleWalletIds: string[]; tokenRows: BackendTokenRow[]; onSelect: (id: string) => void; onToggleBundle: (id: string) => void; onOpenPositions: () => void }) {
  return <div className="terminalDataTable walletOpsTable selectableWalletTable" role="table" aria-label="Trading wallets"><div className="terminalDataRow terminalDataHead" role="row"><span>Bundle</span><span>Wallet</span><span>Role</span><span>SOL</span><span>Token holding</span><span>Project use</span><span>Actions</span></div>{wallets.map((wallet) => { const isSelected = selectedWalletId === wallet.id; const inBundle = bundleWalletIds.includes(wallet.id); const tokenRow = tokenRows.find((row) => row.id === wallet.id || row.address === wallet.address); return <div className={`terminalDataRow ${isSelected ? 'selectedWalletRow' : ''}`} role="row" key={wallet.id}><span><input type="checkbox" checked={inBundle} onChange={() => onToggleBundle(wallet.id)} aria-label={`Add ${wallet.role} to bundle`} /></span><strong>{compactAddress(wallet.address)}</strong><span>{wallet.role}</span><span>{wallet.balanceSol.toFixed(4)} SOL</span><span>{(tokenRow?.uiAmount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span><span>{wallet.purpose}</span><div className="terminalRowActions"><button type="button" onClick={() => onSelect(wallet.id)}>{isSelected ? 'Selected' : 'Select'}</button><button type="button" onClick={() => onToggleBundle(wallet.id)}>{inBundle ? 'Remove' : 'Multi'}</button><button type="button" onClick={onOpenPositions}>Open positions</button></div></div>; })}</div>;
}


function SignalsPanel({ freshRows, bundleRows, topTraders, holderRows, holderValuedRows, holderPnlRows, traderPnlRows, pumpfunRows, liquidityUsd, sourceFresh, sourceBundles }: { freshRows: Array<Record<string, unknown>>; bundleRows: Array<Record<string, unknown>>; topTraders: UiTopTrader[]; holderRows: UiHolderRow[]; holderValuedRows: number; holderPnlRows: number; traderPnlRows: number; pumpfunRows: string; liquidityUsd: unknown; sourceFresh: string; sourceBundles: string }) {
  return <div className="signalsIntelSurface"><RowsTable head={['Signal', 'Value', 'Source']} rows={[[ 'Fresh/snipers', `${freshRows.length} rows`, sourceFresh ], [ 'Bundles', `${bundleRows.length} clusters`, sourceBundles ], [ 'Top traders', `${topTraders.length} rows`, 'Ranked wallets' ], [ 'Pump.fun trades', pumpfunRows, 'Pump.fun tape' ], [ 'Holder value coverage', `${holderValuedRows}/${holderRows.length}`, 'DexScreener price × holders' ], [ 'Holder PnL coverage', `${holderPnlRows}/${holderRows.length}`, 'holder wallet × trade tape' ], [ 'Trader PnL coverage', `${traderPnlRows}/${topTraders.length}`, 'top traders × current price' ], [ 'Liquidity', String(liquidityUsd ?? 'loading'), 'Pool index' ]]} /><div className="signalTablesGrid"><div><h4>Fresh / sniper wallets</h4><div className="terminalDataTable freshWalletIntelTable" role="table" aria-label="Fresh wallet classifier rows"><div className="terminalDataRow terminalDataHead" role="row"><span>Wallet</span><span>Fresh</span><span>Age</span><span>Txs</span><span>Buys/Sells</span><span>Net tokens</span><span>Funding</span><span>Hold</span><span>Tags</span></div>{freshRows.slice(0, 16).map((row, index) => { const wallet = String(row.wallet ?? ''); return <div className="terminalDataRow" role="row" key={`fresh-${wallet || index}`}><strong>{compactAddress(wallet)}</strong><span>{String(row.fresh ?? 'unknown')}</span><span>{typeof row.ageDays === 'number' ? `${row.ageDays}d` : '—'}</span><span>{String(row.txCountSampled ?? '—')}</span><span>{String(row.buys ?? 0)}/{String(row.sells ?? 0)}</span><span>{formatTokenAmount(typeof row.netTokens === 'number' ? row.netTokens : null)}</span><span>{row.fundingFrom ? compactAddress(String(row.fundingFrom)) : String(row.fundingSource ?? 'history')}</span><span>{typeof row.holdWindowHours === 'number' ? `${row.holdWindowHours}h` : '—'}</span><span>{Array.isArray(row.tags) ? row.tags.join(' · ') : String(row.reason ?? 'classified')}</span></div>; })}{freshRows.length === 0 && <div className="terminalDataRow" role="row"><strong>No fresh rows</strong><span>{sourceFresh}</span><span>Need trade tape wallets</span><span>—</span></div>}</div></div><div><h4>Bundle clusters</h4><div className="terminalDataTable bundleClusterIntelTable" role="table" aria-label="Bundle cluster rows"><div className="terminalDataRow terminalDataHead" role="row"><span>Cluster</span><span>Slot/time</span><span>Wallets</span><span>Txs</span><span>Amount</span><span>Suspicion</span><span>Signatures</span></div>{bundleRows.slice(0, 16).map((row, index) => <div className="terminalDataRow" role="row" key={`cluster-${String(row.key ?? index)}`}><strong>{String(row.key ?? `cluster ${index + 1}`)}</strong><span>{String(row.slot ?? row.timestamp ?? '—')}</span><span>{String(row.walletCount ?? '—')}</span><span>{String(row.transactionCount ?? '—')}</span><span>{formatTokenAmount(typeof row.tokenTransferAmount === 'number' ? row.tokenTransferAmount : null)}</span><span>{row.suspectedBundle ? 'suspected' : 'normal'}</span><span>{Array.isArray(row.signatures) && row.signatures[0] ? compactAddress(String(row.signatures[0])) : '—'}</span></div>)}{bundleRows.length === 0 && <div className="terminalDataRow" role="row"><strong>No clusters</strong><span>{sourceBundles}</span><span>No wallet-level clusters detected.</span><span>—</span></div>}</div></div></div></div>;
}

function BundlePanel({ wallets, bundleRows, execution, onPreflight, loading }: { wallets: TerminalWallet[]; bundleRows: Array<Record<string, unknown>>; execution?: string; onPreflight: () => void; loading: boolean }) {
  const suspected = bundleRows.filter((row) => Boolean(row.suspectedBundle)).length;
  return <div className="bundleTabSurface"><div className="terminalTabActionBar"><strong>Bundle preflight</strong><span>{execution ?? `${bundleRows.length} indexed clusters · ${suspected} suspected`}</span><button type="button" onClick={onPreflight} disabled={loading}>Preflight selected wallets</button></div><div className="bundlePreviewGrid tabBundleGrid">{wallets.map((wallet, index) => <div className="bundleWalletCard" key={wallet.id}><label><input type="checkbox" checked readOnly /> Wallet {index + 1}</label><strong>{compactAddress(wallet.address)}</strong><span>{wallet.role} · {wallet.balanceSol.toFixed(4)} SOL</span><small>Leg: Buy 0.01 SOL · signer required</small></div>)}{wallets.length === 0 && <div className="bundleWalletCard emptyBundleCard"><strong>No wallets selected</strong><span>Select wallets in the Wallets tab.</span></div>}</div><div className="terminalDataTable bundleIntelTable" role="table" aria-label="Indexed token bundle clusters"><div className="terminalDataRow terminalDataHead" role="row"><span>Cluster</span><span>Slot/time</span><span>Wallets</span><span>Txs</span><span>Token amount</span><span>Suspicion</span><span>First signatures</span></div>{bundleRows.slice(0, 24).map((row, index) => { const signatures = Array.isArray(row.signatures) ? row.signatures.map(String).slice(0, 2) : []; return <div className="terminalDataRow" role="row" key={`bundle-tab-${String(row.key ?? index)}`}><strong>{String(row.key ?? `cluster ${index + 1}`)}</strong><span>{String(row.slot ?? row.timestamp ?? '—')}</span><span>{String(row.walletCount ?? '—')}</span><span>{String(row.transactionCount ?? '—')}</span><span>{formatTokenAmount(typeof row.tokenTransferAmount === 'number' ? row.tokenTransferAmount : null)}</span><span>{row.suspectedBundle ? 'suspected bundle' : 'normal slot'}</span><span>{signatures.length ? signatures.map((signature) => <a href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noreferrer" key={signature}>{compactAddress(signature)}</a>) : '—'}</span></div>; })}{bundleRows.length === 0 && <div className="terminalDataRow" role="row"><strong>No indexed clusters</strong><span>No bundle clusters detected</span><span>Load an active market for deeper grouping</span><span>—</span></div>}</div></div>;
}

function RowsTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return <div className="terminalDataTable tabRowsTable" role="table"><div className="terminalDataRow terminalDataHead" role="row">{head.map((cell) => <span key={cell}>{cell}</span>)}</div>{rows.map((row) => <div className="terminalDataRow" role="row" key={row.join('-')}>{row.map((cell, index) => index === 0 ? <strong key={`${cell}-${index}`}>{cell}</strong> : <span key={`${cell}-${index}`}>{cell}</span>)}</div>)}</div>;
}
