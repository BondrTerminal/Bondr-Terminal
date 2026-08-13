'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TerminalHolderAccount, TerminalTokenSnapshot, TerminalTopTrader, TerminalTradeEvent } from '../../../lib/terminal/contracts';
import { PreLiveDryRunAction } from './PreLiveDryRunAction';

type TerminalWallet = { id: string; address: string; role: string; scope: string; balanceSol: number; purpose: string };
type Flow = { buysSol: number; sellsSol: number; netSol: number } | null;
type IntelTab = 'Positions' | 'Orders' | 'Holders' | 'Top Traders' | 'Dev Tokens' | 'Only Tracked' | 'Instant Trade' | 'Checklist';
type HolderFilter = 'all' | 'tagged' | 'pnl' | 'whales';
type HolderSort = 'rank' | 'amount' | 'pct' | 'value' | 'pnl' | 'txs' | 'lastSeen';
type ChecklistItem = { id: string; label: string; status: 'pass' | 'warn' | 'fail'; evidence: string; owner: string };
type ChecklistSummary = { state: string; failed: string[]; warnings: string[]; items: ChecklistItem[] };
type RpcSummary = { status: string; providerLabel?: string | null; quotaLimited?: boolean; configuredProviderCount: number; providerSummary?: string | null; currentSlot?: number | null; providers: Array<{ label: string; status: string; quotaLimited: boolean; latencyMs: number | null; currentSlot: number | null }> };

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
  execution?: { liveTradingEnabled?: boolean; terminalOrders?: { orders?: TerminalOrder[]; execution?: string } };
  wallets?: { count?: number; totalSol?: number; tokenBalances?: { walletCount?: number; nonZeroWallets?: number; totalUiAmount?: number; rows?: BackendTokenRow[] }; rows?: BackendWalletRow[] };
  accounting?: Flow;
};
type PositionRow = {
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
type SnapshotWithExtras = TerminalTokenSnapshot & {
  tradeTape?: { status?: string; primary?: string; rows?: number; blockers?: string[]; optionalProviderGaps?: string[]; recommendedFixes?: string[]; latencyMs?: number | null; note?: string | null };
  positions?: { rows?: PositionRow[]; summary?: Record<string, unknown> | null; source?: string };
  paperTradeDecision?: { status?: string; execution?: string; liveTradingEnabled?: boolean; currentPriceUsd?: number | null; note?: string | null };
  riskVerdict?: { status?: string; reasons?: string[]; note?: string | null; liveTradingAllowed?: boolean };
  pumpfun?: { token?: Record<string, unknown>; migrations?: { migrations?: Array<Record<string, unknown>>; status?: string; note?: string | null }; devTokens?: { tokens?: Array<Record<string, unknown>>; status?: string; note?: string | null } };
};
type ExecutionCapabilities = { liveTradingEnabled?: boolean; disabledReason?: string | null; signer?: string | null; broadcaster?: string | null; limits?: { maxSolPerSwap?: number; maxSlippageBps?: number } };
type QuotePayload = { status?: string; error?: string; execution?: string; request?: Record<string, unknown>; quote?: { outAmount?: string | null; priceImpactPct?: string | null; routeLabels?: string[]; routePlanLength?: number }; safety?: string };

type UiHolderRow = TerminalHolderAccount & {
  rank?: number;
  pctSupply?: number | null;
  valueUsd?: number | null;
  boughtTokens?: number | null;
  soldTokens?: number | null;
  netTokensFromTape?: number | null;
  avgEntryUsd?: number | null;
  avgExitUsd?: number | null;
  realizedPnlUsd?: number | null;
  unrealizedPnlUsd?: number | null;
  totalPnlUsd?: number | null;
  txCount?: number | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  ownerSolBalance?: number | null;
  pnlStatus?: string | null;
  tags?: string[];
  dataSources?: string[];
};

type UiTopTrader = TerminalTopTrader & { tags?: string[]; sources?: string[] };

const tabs: IntelTab[] = ['Positions', 'Orders', 'Holders', 'Top Traders', 'Dev Tokens', 'Only Tracked', 'Instant Trade', 'Checklist'];
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function compactAddress(address: string | null | undefined) {
  return address && ADDRESS_RE.test(address) ? `${address.slice(0, 6)}…${address.slice(-5)}` : '—';
}
function formatUsd(value: number | null | undefined, fallback = '—') {
  return typeof value === 'number' && Number.isFinite(value) ? `$${value.toLocaleString(undefined, { maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2 })}` : fallback;
}
function formatNumber(value: number | string | null | undefined, fallback = '—') {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: Math.abs(number) >= 1000 ? 0 : 4 }) : fallback;
}
function formatPct(value: number | null | undefined, fallback = '—') {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}%` : fallback;
}
function formatTime(value: string | null | undefined, fallback = '—') {
  return value ? new Date(value).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : fallback;
}
function pnlClass(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'neutralPnlCell';
  return value >= 0 ? 'positivePnlCell' : 'negativePnlCell';
}
function sourceValue(snapshot: TerminalTokenSnapshot | null, key: string) {
  const value = (snapshot?.sources as Record<string, unknown> | undefined)?.[key];
  if (!value) return 'loading';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'source' in value) return String((value as { source?: unknown }).source ?? 'read');
  return 'read';
}
function asBackend(snapshot: TerminalTokenSnapshot | null): TerminalBackendShape | null {
  return (snapshot?.terminal ?? null) as TerminalBackendShape | null;
}
function textFromUnknown(value: unknown, fallback = '—') {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}
function includesWallet(rowWallet: string | null | undefined, tracked: Set<string>) {
  return Boolean(rowWallet && tracked.has(rowWallet.toLowerCase()));
}

function DataTable({ head, rows, empty, className = '' }: { head: string[]; rows: Array<Array<React.ReactNode>>; empty: React.ReactNode; className?: string }) {
  return <div className={`axiomIntelTableWrap ${className}`}><table className="axiomIntelTable"><thead><tr>{head.map((cell) => <th key={cell}>{cell}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={head.length}>{empty}</td></tr>}</tbody></table></div>;
}
function Chip({ label, value, tone = 'neutral' }: { label: string; value: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  return <div className={`axiomIntelChip ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}
function SourceBadge({ label, value }: { label: string; value: React.ReactNode }) {
  return <span className="axiomSourceBadge"><em>{label}</em>{value}</span>;
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="axiomIntelEmpty"><strong>{title}</strong><span>{detail}</span></div>;
}

function snapshotScore(snapshot: TerminalTokenSnapshot | null) {
  if (!snapshot) return 0;
  const holders = snapshot.holders?.rows?.length ?? 0;
  const trades = snapshot.trades?.rows?.length ?? 0;
  const positions = (snapshot as SnapshotWithExtras).positions?.rows?.length ?? 0;
  const tokenRows = asBackend(snapshot)?.wallets?.tokenBalances?.rows?.length ?? 0;
  return holders * 4 + trades * 2 + positions + tokenRows;
}

function mergeUsefulSnapshot(current: TerminalTokenSnapshot | null, next: TerminalTokenSnapshot) {
  if (!current) return next;
  const nextScore = snapshotScore(next);
  const currentScore = snapshotScore(current);
  if (nextScore >= currentScore || next.status === 'ok') {
    const currentTrades = current.trades?.rows ?? [];
    const nextTrades = next.trades?.rows ?? [];
    const currentHolders = current.holders?.rows ?? [];
    const nextHolders = next.holders?.rows ?? [];
    return {
      ...current,
      ...next,
      trades: { ...(current.trades ?? {}), ...(next.trades ?? {}), rows: nextTrades.length ? nextTrades : currentTrades, topTraders: next.trades?.topTraders?.length ? next.trades.topTraders : current.trades?.topTraders ?? [] },
      holders: { ...(current.holders ?? {}), ...(next.holders ?? {}), rows: nextHolders.length ? nextHolders : currentHolders }
    } as TerminalTokenSnapshot;
  }
  return current;
}

export function TerminalInfoBooth({ wallets, flow, mint, projectId, projectName, terminalWarning, liveReadinessStatus, authConfigured, sessionAuthenticated, rpcSummary, checklist }: { wallets: TerminalWallet[]; flow: Flow; mint?: string; projectId?: string; projectName?: string | null; terminalWarning?: string | null; liveReadinessStatus?: string; authConfigured?: boolean; sessionAuthenticated?: boolean; rpcSummary?: RpcSummary; checklist?: ChecklistSummary }) {
  const [activeTab, setActiveTab] = useState<IntelTab>('Holders');
  const [activeMint, setActiveMint] = useState(mint ?? '');
  const [snapshot, setSnapshot] = useState<TerminalTokenSnapshot | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState('idle');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [holderSearch, setHolderSearch] = useState('');
  const [holderFilter, setHolderFilter] = useState<HolderFilter>('all');
  const [holderSort, setHolderSort] = useState<HolderSort>('rank');
  const [selectedWalletId, setSelectedWalletId] = useState(wallets[0]?.id ?? '');
  const [instantSide, setInstantSide] = useState<'Buy' | 'Sell'>('Buy');
  const [instantAmount, setInstantAmount] = useState('0.05');
  const [instantSlippage, setInstantSlippage] = useState('100');
  const [capabilities, setCapabilities] = useState<ExecutionCapabilities | null>(null);
  const [quote, setQuote] = useState<QuotePayload | null>(null);
  const [quoteStatus, setQuoteStatus] = useState('idle');

  useEffect(() => setActiveMint(mint ?? ''), [mint]);
  useEffect(() => {
    if (!wallets.length) return;
    setSelectedWalletId((current) => wallets.some((wallet) => wallet.id === current) ? current : wallets[0].id);
  }, [wallets]);
  useEffect(() => {
    function onTokenLoaded(event: Event) {
      const custom = event as CustomEvent<{ mint?: string }>;
      if (custom.detail?.mint) setActiveMint(custom.detail.mint);
    }
    function onRefresh() { setRefreshNonce((value) => value + 1); }
    window.addEventListener('meridian-token-loaded', onTokenLoaded);
    window.addEventListener('meridian-terminal-refresh', onRefresh);
    return () => {
      window.removeEventListener('meridian-token-loaded', onTokenLoaded);
      window.removeEventListener('meridian-terminal-refresh', onRefresh);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/execution-capabilities', { signal: controller.signal, cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setCapabilities(payload as ExecutionCapabilities | null))
      .catch(() => setCapabilities(null));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!activeMint) {
      setSnapshot(null);
      setSnapshotStatus('waiting-for-token');
      return;
    }
    const devWallets = wallets.map((wallet) => wallet.address).join(',');
    const query = new URLSearchParams({ mint: activeMint, holderLimit: '100', limit: '100', profile: 'live-read', fastPrimary: '1' });
    const enrichmentQuery = new URLSearchParams({ mint: activeMint, holderLimit: '120', limit: '120', profile: 'live-read', enrich: '1', enrichHolderLifecycle: '1' });
    if (projectId) { query.set('project', projectId); enrichmentQuery.set('project', projectId); }
    if (devWallets) { query.set('devWallets', devWallets); enrichmentQuery.set('devWallets', devWallets); }
    const controller = new AbortController();
    setSnapshotStatus('syncing');
    void fetch(`/api/terminal/snapshot?${query.toString()}`, { signal: controller.signal, cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`snapshot ${response.status}`)))
      .then((payload) => {
        setSnapshot((current) => mergeUsefulSnapshot(current, payload as TerminalTokenSnapshot));
        setSnapshotStatus('synced-fast');
      })
      .catch((error) => { if (!controller.signal.aborted) setSnapshotStatus(error instanceof Error ? error.message : 'snapshot failed'); });
    const enrichmentTimer = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      setSnapshotStatus('enriching');
      void fetch(`/api/terminal/snapshot?${enrichmentQuery.toString()}`, { signal: controller.signal, cache: 'no-store' })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`snapshot ${response.status}`)))
        .then((payload) => {
          setSnapshot((current) => mergeUsefulSnapshot(current, payload as TerminalTokenSnapshot));
          setSnapshotStatus('enriched');
        })
        .catch((error) => { if (!controller.signal.aborted) setSnapshotStatus(error instanceof Error ? error.message : 'enrichment failed'); });
    }, 900);
    const streamDisabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('stream') === '0';
    const streamEnabled = !streamDisabled;
    const stream = streamEnabled ? new EventSource(`/api/terminal/stream?${query.toString()}&intervalMs=15000`) : null;
    stream?.addEventListener('open', () => setSnapshotStatus('stream-connected'));
    stream?.addEventListener('snapshot', (event) => {
      try { setSnapshot((current) => mergeUsefulSnapshot(current, JSON.parse((event as MessageEvent).data) as TerminalTokenSnapshot)); setSnapshotStatus('live'); } catch { setSnapshotStatus('stream-parse-error'); }
    });
    stream?.addEventListener('partial', (event) => {
      try { setSnapshot((current) => mergeUsefulSnapshot(current, JSON.parse((event as MessageEvent).data) as TerminalTokenSnapshot)); setSnapshotStatus('stream-partial'); } catch { setSnapshotStatus('stream-partial'); }
    });
    stream?.addEventListener('heartbeat', () => setSnapshotStatus('stream-connected'));
    stream?.addEventListener('error', () => setSnapshotStatus('stream-reconnecting'));
    return () => { window.clearTimeout(enrichmentTimer); controller.abort(); stream?.close(); };
  }, [activeMint, projectId, refreshNonce, wallets]);

  const extras = snapshot as SnapshotWithExtras | null;
  const backend = asBackend(snapshot);
  const renderedWallets = backend?.wallets?.rows?.length ? backend.wallets.rows.map((wallet) => ({ ...wallet, balanceSol: wallet.solBalance ?? wallet.balanceSol ?? 0, scope: wallet.scope ?? 'global' })) : wallets;
  const trackedAddresses = useMemo(() => new Set(renderedWallets.map((wallet) => wallet.address.toLowerCase())), [renderedWallets]);
  const selectedWallet = renderedWallets.find((wallet) => wallet.id === selectedWalletId) ?? renderedWallets[0] ?? null;
  const holders = snapshot?.holders;
  const holderRows = (holders?.rows ?? []) as UiHolderRow[];
  const trades = snapshot?.trades?.rows ?? [];
  const topTraders = (snapshot?.trades?.topTraders ?? []) as UiTopTrader[];
  const orders = ((snapshot?.orders as { orders?: TerminalOrder[] } | null)?.orders ?? backend?.execution?.terminalOrders?.orders ?? []).filter((order) => !activeMint || order.mint === activeMint);
  const tokenRows = backend?.wallets?.tokenBalances?.rows ?? [];
  const positions = (extras?.positions?.rows?.length ? extras.positions.rows : renderedWallets.map((wallet) => {
    const tokenRow = tokenRows.find((row) => row.id === wallet.id || row.address === wallet.address);
    return { wallet: wallet.address, role: wallet.role, uiAmount: tokenRow?.uiAmount ?? 0, valueUsd: null, avgEntryUsd: null, avgExitUsd: null, realizedPnlUsd: null, unrealizedPnlUsd: null, totalPnlUsd: null, txCount: null, lastSeenAt: null, source: ['wallet-token-balances'], status: tokenRow ? 'balance-only' : 'tracked-empty' } satisfies PositionRow;
  }));
  const selectedWalletPosition = selectedWallet ? positions.find((position) => position.wallet.toLowerCase() === selectedWallet.address.toLowerCase()) ?? null : null;
  const tradeTape = extras?.tradeTape ?? (snapshot?.trades as { tradeTape?: SnapshotWithExtras['tradeTape'] } | undefined)?.tradeTape ?? null;
  const pumpfunDevTokens = extras?.pumpfun?.devTokens?.tokens ?? [];
  const devWalletRows = (snapshot?.devTokens?.wallets ?? []) as Array<Record<string, unknown>>;
  const devTokenRows = [...pumpfunDevTokens, ...devWalletRows];
  const market = (snapshot?.market ?? {}) as Record<string, unknown>;
  const liquidity = (snapshot?.liquidity ?? {}) as Record<string, unknown>;
  const security = (snapshot?.security ?? {}) as Record<string, unknown>;

  const holderStats = useMemo(() => {
    const returned = holders?.returnedRows ?? holderRows.length;
    const total = holders?.totalHolders ?? holders?.walletCountReturned ?? null;
    const top10 = holderRows.slice(0, 10).reduce((sum, row) => sum + (row.pctSupply ?? 0), 0);
    const riskTagged = holderRows.filter((row) => (row.tags ?? []).some((tag) => /dev|insider|sniper|bundle|fresh|whale|risk/i.test(tag))).length;
    return { returned, total, top10: top10 || null, riskTagged, valuedRows: holderRows.filter((row) => typeof row.valueUsd === 'number').length, pnlRows: holderRows.filter((row) => typeof row.totalPnlUsd === 'number').length };
  }, [holders, holderRows]);

  const filteredHolders = useMemo(() => {
    const search = holderSearch.trim().toLowerCase();
    const sortValue = (row: UiHolderRow) => {
      if (holderSort === 'amount') return row.uiAmount ?? 0;
      if (holderSort === 'pct') return row.pctSupply ?? -1;
      if (holderSort === 'value') return row.valueUsd ?? -1;
      if (holderSort === 'pnl') return row.totalPnlUsd ?? -Number.MAX_SAFE_INTEGER;
      if (holderSort === 'txs') return row.txCount ?? -1;
      if (holderSort === 'lastSeen') return row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0;
      return -(row.rank ?? 999999);
    };
    return holderRows
      .filter((row) => !search || `${row.owner ?? ''} ${row.tokenAccount ?? ''} ${(row.tags ?? []).join(' ')}`.toLowerCase().includes(search))
      .filter((row) => holderFilter === 'all' || (holderFilter === 'tagged' && (row.tags ?? []).length > 0) || (holderFilter === 'pnl' && typeof row.totalPnlUsd === 'number') || (holderFilter === 'whales' && (row.pctSupply ?? 0) >= 1))
      .sort((a, b) => holderSort === 'rank' ? (a.rank ?? 999999) - (b.rank ?? 999999) : sortValue(b) - sortValue(a));
  }, [holderRows, holderSearch, holderFilter, holderSort]);

  const trackedHolders = holderRows.filter((row) => includesWallet(row.owner, trackedAddresses) || includesWallet(row.tokenAccount, trackedAddresses));
  const trackedTrades = trades.filter((trade) => includesWallet(trade.wallet, trackedAddresses));
  const trackedOrders = orders.filter((order) => includesWallet(order.wallet, trackedAddresses));
  const trackedPositions = positions.filter((position) => includesWallet(position.wallet, trackedAddresses));

  const tabCounts: Record<IntelTab, string> = {
    Positions: String(positions.filter((position) => position.uiAmount > 0).length || positions.length || 0),
    Orders: String(orders.length),
    Holders: holderStats.total ? `(${holderStats.total.toLocaleString()})` : String(holderRows.length || 0),
    'Top Traders': String(topTraders.length),
    'Dev Tokens': `(${devTokenRows.length})`,
    'Only Tracked': String(trackedPositions.length + trackedOrders.length + trackedTrades.length),
    'Instant Trade': capabilities?.liveTradingEnabled ? 'LIVE' : 'GATED',
    Checklist: checklist?.state ?? 'TEMP'
  };

  async function previewQuote() {
    if (!activeMint || quoteStatus === 'quoting') return;
    setQuoteStatus('quoting');
    setQuote(null);
    try {
      const response = await fetch('/api/execution-quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mint: activeMint, side: instantSide, amount: instantAmount, spendAsset: 'SOL', slippageBps: Number(instantSlippage), mode: 'terminal-instant-preview' })
      });
      const payload = await response.json() as QuotePayload;
      setQuote(payload);
      setQuoteStatus(response.ok ? 'quote-ready' : String(payload.error ?? 'quote-error'));
    } catch (error) {
      setQuoteStatus(error instanceof Error ? error.message : 'quote failed');
    }
  }

  return <section className="terminalInfoBooth axiomIntelBooth" data-contract="terminal-snapshot-v1" data-live-execution="disabled">
    <header className="axiomIntelHeader">
      <div>
        <span>BONDR Terminal Intelligence</span>
        <strong>{activeMint ? compactAddress(activeMint) : 'Load a token'}</strong>
        <small>{snapshotStatus} · source labels are explicit; unavailable metrics stay blank.</small>
      </div>
      <div className="axiomIntelHeaderStats">
        <SourceBadge label="Price" value={formatUsd(typeof market.priceUsd === 'number' ? market.priceUsd : null)} />
        <SourceBadge label="MC" value={formatUsd(typeof market.marketCapUsd === 'number' ? market.marketCapUsd : null)} />
        <SourceBadge label="Liq" value={formatUsd(typeof market.liquidityUsd === 'number' ? market.liquidityUsd : typeof liquidity.liquidityUsd === 'number' ? liquidity.liquidityUsd : null)} />
        <SourceBadge label="Holders" value={holderStats.total?.toLocaleString() ?? holderStats.returned} />
        <SourceBadge label="Live" value={capabilities?.liveTradingEnabled ? 'enabled' : 'disabled'} />
      </div>
    </header>

    <nav className="axiomIntelTabs" role="tablist" aria-label="Terminal intelligence tabs">
      {tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} key={tab} onClick={() => setActiveTab(tab)}><span>{tab}</span><em>{tabCounts[tab]}</em></button>)}
    </nav>

    <div className="axiomIntelPanel" role="tabpanel">
      {!snapshot && <EmptyState title="Waiting for token snapshot" detail={activeMint ? snapshotStatus : 'Load a token to hydrate holders, positions, orders, top traders, dev history, and trade tape.'} />}
      {snapshot && activeTab === 'Positions' && <PositionsTab rows={positions} flow={backend?.accounting ?? flow} summary={extras?.positions?.summary ?? null} inventory={backend?.wallets?.tokenBalances} />}
      {snapshot && activeTab === 'Orders' && <OrdersTab orders={orders} execution={backend?.execution?.terminalOrders?.execution} liveTradingEnabled={Boolean(capabilities?.liveTradingEnabled)} />}
      {snapshot && activeTab === 'Holders' && <HoldersTab holders={holders} rows={filteredHolders} rawRows={holderRows} stats={holderStats} search={holderSearch} filter={holderFilter} sort={holderSort} onSearch={setHolderSearch} onFilter={setHolderFilter} onSort={setHolderSort} />}
      {snapshot && activeTab === 'Top Traders' && <TopTradersTab rows={topTraders} trades={trades} />}
      {snapshot && activeTab === 'Dev Tokens' && <DevTokensTab rows={devTokenRows} source={sourceValue(snapshot, 'devSold')} currentToken={extras?.pumpfun?.token ?? null} />}
      {snapshot && activeTab === 'Only Tracked' && <OnlyTrackedTab positions={trackedPositions} holders={trackedHolders} trades={trackedTrades} orders={trackedOrders} wallets={renderedWallets} />}
      {activeTab === 'Instant Trade' && <InstantTradeTab activeMint={activeMint} wallets={renderedWallets} selectedWallet={selectedWallet} selectedPosition={selectedWalletPosition} selectedWalletId={selectedWalletId} onSelectWallet={setSelectedWalletId} side={instantSide} onSide={setInstantSide} amount={instantAmount} onAmount={setInstantAmount} slippage={instantSlippage} onSlippage={setInstantSlippage} capabilities={capabilities} quote={quote} quoteStatus={quoteStatus} onPreview={() => void previewQuote()} />}
      {activeTab === 'Checklist' && <ChecklistTab projectId={projectId} projectName={projectName} activeMint={activeMint} terminalWarning={terminalWarning} liveReadinessStatus={liveReadinessStatus} authConfigured={authConfigured} sessionAuthenticated={sessionAuthenticated} rpcSummary={rpcSummary} checklist={checklist} />}
    </div>
  </section>;
}

function PositionsTab({ rows, flow, summary, inventory }: { rows: PositionRow[]; flow: Flow; summary: Record<string, unknown> | null; inventory?: TerminalBackendShape['wallets'] extends infer W ? W extends { tokenBalances?: infer T } ? T : never : never }) {
  const nonZero = rows.filter((row) => row.uiAmount > 0);
  const totalValue = rows.reduce((sum, row) => sum + (row.valueUsd ?? 0), 0);
  const totalPnl = rows.reduce((sum, row) => sum + (row.totalPnlUsd ?? 0), 0);
  return <div className="axiomIntelSurface"><div className="axiomIntelChips"><Chip label="Tracked wallets" value={rows.length} /><Chip label="Non-zero" value={nonZero.length || (inventory?.nonZeroWallets ?? 0)} /><Chip label="Total tokens" value={formatNumber(inventory?.totalUiAmount ?? nonZero.reduce((sum, row) => sum + row.uiAmount, 0))} /><Chip label="Value" value={formatUsd(typeof summary?.totalValueUsd === 'number' ? summary.totalValueUsd : (totalValue || null))} /><Chip label="30d net SOL" value={flow ? `${flow.netSol.toFixed(2)} SOL` : '—'} /><Chip label="Total PnL" value={formatUsd(typeof summary?.totalPnlUsd === 'number' ? summary.totalPnlUsd : (totalPnl || null), 'need tape')} tone={totalPnl >= 0 ? 'good' : 'bad'} /></div><DataTable className="positionsIntelTable" head={['Wallet', 'Role', 'Amount', 'Value', 'Avg Entry', 'Avg Exit', 'Realized', 'Unrealized', 'Total PnL', 'Last Seen', 'Source']} rows={rows.map((row) => [compactAddress(row.wallet), row.role ?? 'tracked', formatNumber(row.uiAmount), formatUsd(row.valueUsd), formatUsd(row.avgEntryUsd), formatUsd(row.avgExitUsd), <span className={pnlClass(row.realizedPnlUsd)}>{formatUsd(row.realizedPnlUsd)}</span>, <span className={pnlClass(row.unrealizedPnlUsd)}>{formatUsd(row.unrealizedPnlUsd)}</span>, <span className={pnlClass(row.totalPnlUsd)}>{formatUsd(row.totalPnlUsd, row.status === 'balance-only' ? 'need tape' : '—')}</span>, formatTime(row.lastSeenAt), `${row.status} · ${(row.source ?? []).join(', ') || 'wallet balances'}`])} empty={<EmptyState title="No tracked positions" detail="Load a token or attach tracked wallets with token balances. PnL requires trade tape/provider data." />} /></div>;
}

function OrdersTab({ orders, execution, liveTradingEnabled }: { orders: TerminalOrder[]; execution?: string; liveTradingEnabled: boolean }) {
  return <div className="axiomIntelSurface"><div className="axiomIntelChips"><Chip label="Orders" value={orders.length} /><Chip label="Open" value={orders.filter((order) => order.status === 'open').length} /><Chip label="Triggered" value={orders.filter((order) => order.status === 'triggered').length} /><Chip label="Execution" value={execution ?? 'gated/order-monitor'} /><Chip label="Live gate" value={liveTradingEnabled ? 'enabled' : 'disabled'} tone={liveTradingEnabled ? 'warn' : 'good'} /></div><DataTable className="ordersIntelTable" head={['Created', 'Side', 'Kind', 'Wallet', 'Amount', 'Trigger', 'Status', 'Observed', 'Lifecycle']} rows={orders.map((order) => [formatTime(order.createdAt), order.side, order.kind, compactAddress(order.wallet), `${order.amount} ${order.spendAsset}`, order.triggerPriceUsd ? `${order.triggerDirection ?? ''} ${formatUsd(order.triggerPriceUsd)}` : 'market/gated', order.status, typeof order.lastObservedPriceUsd === 'number' ? formatUsd(order.lastObservedPriceUsd) : 'not evaluated', `${order.lifecycleStage ?? 'created'} · ${order.signature ? 'signed tx observed' : 'no signed tx'}`])} empty={<EmptyState title="No orders for this mint" detail="Orders/intents are shown as gated unless execution contracts prove otherwise." />} /></div>;
}

function HoldersTab({ holders, rows, rawRows, stats, search, filter, sort, onSearch, onFilter, onSort }: { holders: TerminalTokenSnapshot['holders']; rows: UiHolderRow[]; rawRows: UiHolderRow[]; stats: { returned: number; total: number | null; top10: number | null; riskTagged: number; valuedRows: number; pnlRows: number }; search: string; filter: HolderFilter; sort: HolderSort; onSearch: (value: string) => void; onFilter: (value: HolderFilter) => void; onSort: (value: HolderSort) => void }) {
  const coverage = stats.total ? `${stats.returned}/${stats.total.toLocaleString()} loaded` : `${stats.returned} loaded`;
  const truncated = Boolean(holders?.isTruncated || (stats.total && stats.returned < stats.total));
  return <div className="axiomIntelSurface holdersIntelSurface"><div className="axiomIntelChips"><Chip label="Total holders" value={stats.total?.toLocaleString() ?? 'API limited'} /><Chip label="Coverage" value={coverage} tone={truncated ? 'warn' : 'neutral'} /><Chip label="Top 10" value={formatPct(stats.top10)} tone={(stats.top10 ?? 0) >= 40 ? 'bad' : (stats.top10 ?? 0) >= 25 ? 'warn' : 'neutral'} /><Chip label="Risk/dev tags" value={stats.riskTagged} tone={stats.riskTagged ? 'warn' : 'neutral'} /><Chip label="Valued rows" value={stats.valuedRows} /><Chip label="PnL rows" value={stats.pnlRows} /></div><div className="axiomIntelControls"><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search wallet / tag" aria-label="Search holders" /><select value={filter} onChange={(event) => onFilter(event.target.value as HolderFilter)}><option value="all">All holders</option><option value="tagged">Only tagged/risky</option><option value="pnl">Only non-zero PnL data</option><option value="whales">Whales 1%+</option></select><select value={sort} onChange={(event) => onSort(event.target.value as HolderSort)}><option value="rank">Rank</option><option value="amount">Amount</option><option value="pct">% supply</option><option value="value">Value</option><option value="pnl">Total PnL</option><option value="txs">Tx count</option><option value="lastSeen">Last seen</option></select><SourceBadge label="Source" value={`${holders?.source ?? 'snapshot'} · ${holders?.coverageLabel ?? holders?.paginationStatus ?? 'coverage pending'}`} />{truncated && <SourceBadge label="Limit" value="provider-limited/read-only" />}</div><DataTable className="holdersIntelTable" head={['#', 'Owner', 'Token Account', 'Amount', '%', 'Value', 'SOL', 'Bought', 'Sold', 'Net', 'Entry', 'Exit', 'Realized', 'Unrealized', 'Total PnL', 'Txs', 'Seen', 'Tags / Source']} rows={rows.map((row, index) => [row.rank ?? index + 1, compactAddress(row.owner), compactAddress(row.tokenAccount), formatNumber(row.uiAmount), formatPct(row.pctSupply), formatUsd(row.valueUsd), formatNumber(row.ownerSolBalance), formatNumber(row.boughtTokens), formatNumber(row.soldTokens), formatNumber(row.netTokensFromTape ?? ((row.boughtTokens ?? 0) - (row.soldTokens ?? 0))), formatUsd(row.avgEntryUsd), formatUsd(row.avgExitUsd), <span className={pnlClass(row.realizedPnlUsd)}>{formatUsd(row.realizedPnlUsd)}</span>, <span className={pnlClass(row.unrealizedPnlUsd)}>{formatUsd(row.unrealizedPnlUsd)}</span>, <span className={pnlClass(row.totalPnlUsd)}>{formatUsd(row.totalPnlUsd, row.pnlStatus ? '—' : 'need tape')}</span>, row.txCount ?? '—', `${formatTime(row.firstSeenAt)} / ${formatTime(row.lastSeenAt)}`, <span className="tagPillList">{(row.tags?.length ? row.tags : [row.pnlStatus ?? holders?.source ?? 'read-only']).slice(0, 4).map((tag) => <em key={`${row.tokenAccount}-${tag}`}>{tag}</em>)}</span>])} empty={<EmptyState title={rawRows.length ? 'No holders match filters' : 'No holder rows'} detail="Holder coverage depends on token-account/provider access. Trade/PnL columns require wallet-attributed tape." />} /></div>;
}

function TopTradersTab({ rows, trades }: { rows: UiTopTrader[]; trades: TerminalTradeEvent[] }) {
  const totalVolume = rows.reduce((sum, row) => sum + (row.totalVolumeUsd ?? 0), 0) || trades.reduce((sum, trade) => sum + Number(trade.volumeUsd ?? 0), 0);
  const winners = rows.filter((row) => (row.totalPnlUsd ?? 0) > 0).length;
  const losers = rows.filter((row) => (row.totalPnlUsd ?? 0) < 0).length;
  const biggest = rows.reduce<UiTopTrader | null>((best, row) => !best || (row.totalPnlUsd ?? -Infinity) > (best.totalPnlUsd ?? -Infinity) ? row : best, null);
  return <div className="axiomIntelSurface"><div className="axiomIntelChips"><Chip label="Trader rows" value={rows.length} /><Chip label="Tape rows" value={trades.length} /><Chip label="Volume" value={formatUsd(totalVolume || null)} /><Chip label="Winners" value={winners} tone="good" /><Chip label="Losers" value={losers} tone={losers ? 'bad' : 'neutral'} /><Chip label="Biggest PnL" value={biggest ? `${compactAddress(biggest.wallet)} ${formatUsd(biggest.totalPnlUsd)}` : '—'} /></div><DataTable className="tradersIntelTable" head={['Wallet', 'Buys', 'Sells', 'Bought', 'Sold', 'Net', 'Buy Vol', 'Sell Vol', 'Total Vol', 'Entry', 'Exit', 'Realized', 'Unrealized', 'Total PnL', 'Hold', 'Last', 'Tags']} rows={rows.map((row) => [compactAddress(row.wallet), row.buys, row.sells, formatNumber(row.boughtTokens), formatNumber(row.soldTokens), formatNumber(row.netTokens), formatUsd(row.buyVolumeUsd), formatUsd(row.sellVolumeUsd), formatUsd(row.totalVolumeUsd), formatUsd(row.avgEntryUsd), formatUsd(row.avgExitUsd), <span className={pnlClass(row.realizedPnlUsd)}>{formatUsd(row.realizedPnlUsd)}</span>, <span className={pnlClass(row.unrealizedPnlUsd)}>{formatUsd(row.unrealizedPnlUsd)}</span>, <span className={pnlClass(row.totalPnlUsd)}>{formatUsd(row.totalPnlUsd, 'need tape')}</span>, row.holdDurationHours ? `${row.holdDurationHours.toFixed(1)}h` : '—', row.lastTx ? compactAddress(row.lastTx) : formatTime(row.lastSeenAt), <span className="tagPillList">{(row.tags ?? row.sources ?? ['trade-tape']).slice(0, 3).map((tag) => <em key={`${row.wallet}-${tag}`}>{tag}</em>)}</span>])} empty={<EmptyState title="No top traders yet" detail="Wallet-level trader PnL requires a wallet-attributed trade tape provider and enough swap rows." />} /></div>;
}

function DevTokensTab({ rows, source, currentToken }: { rows: Array<Record<string, unknown>>; source: string; currentToken: Record<string, unknown> | null }) {
  const allRows = currentToken ? [currentToken, ...rows] : rows;
  return <div className="axiomIntelSurface"><div className="axiomIntelChips"><Chip label="Dev token rows" value={allRows.length} /><Chip label="Source" value={source} /><Chip label="Mode" value="read-only" tone="good" /></div><DataTable className="devTokensIntelTable" head={['Token', 'Mint', 'Launched', 'ATH / MC', 'Liquidity', 'Migration', 'Status', 'Risk / Source']} rows={allRows.map((row) => [textFromUnknown(row.name ?? row.symbol ?? row.ticker, 'token'), compactAddress(textFromUnknown(row.mint ?? row.address ?? row.tokenAddress, '')), formatTime(textFromUnknown(row.createdAt ?? row.created_at ?? row.launchTime, '')), formatUsd(typeof row.athMarketCapUsd === 'number' ? row.athMarketCapUsd : typeof row.marketCapUsd === 'number' ? row.marketCapUsd : null, textFromUnknown(row.marketCap ?? row.ath, '—')), formatUsd(typeof row.liquidityUsd === 'number' ? row.liquidityUsd : null, textFromUnknown(row.liquidity, '—')), textFromUnknown(row.migrationStatus ?? row.migrated ?? row.poolStatus, '—'), textFromUnknown(row.status ?? row.state, 'observed'), textFromUnknown(row.note ?? row.risk ?? row.source, source)])} empty={<EmptyState title="No dev-token history" detail="Current dev/deployer wallet history is unavailable or clean from configured read-only providers." />} /></div>;
}

function OnlyTrackedTab({ positions, holders, trades, orders, wallets }: { positions: PositionRow[]; holders: UiHolderRow[]; trades: TerminalTradeEvent[]; orders: TerminalOrder[]; wallets: TerminalWallet[] }) {
  return <div className="axiomIntelSurface"><div className="axiomIntelChips"><Chip label="Tracked wallets" value={wallets.length} /><Chip label="Positions" value={positions.length} /><Chip label="Holder rows" value={holders.length} /><Chip label="Trade rows" value={trades.length} /><Chip label="Orders" value={orders.length} /></div><DataTable className="trackedIntelTable" head={['Type', 'Wallet', 'Role / Side', 'Amount', 'Value / Price', 'PnL / Status', 'Last / Source']} rows={[...positions.map((row) => ['Position', compactAddress(row.wallet), row.role ?? 'tracked', formatNumber(row.uiAmount), formatUsd(row.valueUsd), <span className={pnlClass(row.totalPnlUsd)}>{formatUsd(row.totalPnlUsd, row.status)}</span>, `${formatTime(row.lastSeenAt)} · ${(row.source ?? []).join(', ')}`]), ...holders.map((row) => ['Holder', compactAddress(row.owner), (row.tags ?? ['tracked']).join(', '), formatNumber(row.uiAmount), `${formatPct(row.pctSupply)} / ${formatUsd(row.valueUsd)}`, <span className={pnlClass(row.totalPnlUsd)}>{formatUsd(row.totalPnlUsd, row.pnlStatus ?? 'need tape')}</span>, `${formatTime(row.lastSeenAt)} · ${row.dataSources?.join(', ') ?? 'holders'}`]), ...trades.map((trade) => ['Trade', compactAddress(trade.wallet), trade.side, formatNumber(trade.amount), formatUsd(Number(trade.priceUsd ?? NaN)), formatUsd(Number(trade.volumeUsd ?? NaN)), `${formatTime(trade.timestamp)} · ${trade.source ?? 'trade tape'}`]), ...orders.map((order) => ['Order', compactAddress(order.wallet), `${order.side} ${order.kind}`, `${order.amount} ${order.spendAsset}`, order.triggerPriceUsd ? formatUsd(order.triggerPriceUsd) : 'market', order.status, `${formatTime(order.lastEvaluationAt ?? order.createdAt)} · gated`])]} empty={<EmptyState title="No tracked activity" detail="Tracked wallets are loaded, but this token has no matched positions, holder rows, trades, or orders yet." />} /></div>;
}


function ChecklistTab({ projectId, projectName, activeMint, terminalWarning, liveReadinessStatus, authConfigured, sessionAuthenticated, rpcSummary, checklist }: { projectId?: string; projectName?: string | null; activeMint: string; terminalWarning?: string | null; liveReadinessStatus?: string; authConfigured?: boolean; sessionAuthenticated?: boolean; rpcSummary?: RpcSummary; checklist?: ChecklistSummary }) {
  const rpcTone = rpcSummary?.status === 'live' ? 'good' : rpcSummary?.quotaLimited ? 'warn' : 'bad';
  return <div className="axiomIntelSurface checklistIntelSurface">
    <div className="axiomSafetyBanner"><strong>Temporary pre-live checklist</strong><span>Keep until Bond.Terminal is fully complete; remove once readiness surfaces are relocated or no longer needed. This tab is read-only and does not sign, swap, fund, broadcast, or launch.</span></div>
    <div className="axiomIntelChips">
      <Chip label="Project" value={projectName ?? 'No project selected'} />
      <Chip label="Mint" value={activeMint ? compactAddress(activeMint) : 'Load token'} />
      <Chip label="Checklist" value={checklist?.state ?? 'loading'} tone={checklist?.failed?.length ? 'bad' : checklist?.warnings?.length ? 'warn' : 'good'} />
      <Chip label="Wallet readiness" value={liveReadinessStatus ?? 'loading'} />
      <Chip label="RPC" value={rpcSummary?.status ?? 'loading'} tone={rpcTone} />
      <Chip label="Auth" value={authConfigured ? sessionAuthenticated ? 'signed in' : 'configured / login required' : 'missing'} tone={authConfigured ? sessionAuthenticated ? 'good' : 'warn' : 'bad'} />
      <Chip label="Live signing" value="disabled" tone="good" />
    </div>
    <DataTable className="checklistContextTable" head={['Context', 'Value', 'Action / Route']} rows={[
      ['Terminal note', terminalWarning ?? 'Project, mint, and wallet group context loaded.', 'Main terminal remains uncluttered.'],
      ['Deployment', projectId ? `/deployment?project=${projectId}` : '/deployment', 'Open Deployment link should route here.'],
      ['Wallets', projectId ? `/wallets?project=${projectId}` : '/wallets', 'Manage wallets link should route here.'],
      ['Portfolio', projectId ? `/portfolio?project=${projectId}${activeMint ? `&mint=${activeMint}` : ''}` : '/portfolio', 'Portfolio link should preserve project/mint.'],
      ['Resolution API', '/api/pre-live-resolution', 'Read-only pre-live matrix.']
    ]} empty={<EmptyState title="No checklist context" detail="Context props were not supplied." />} />
    <DataTable className="rpcChecklistTable" head={['RPC Provider', 'Status', 'Latency / Slot']} rows={(rpcSummary?.providers ?? []).map((provider) => [provider.label, `${provider.status}${provider.quotaLimited ? ' / quota' : ''}`, `${provider.latencyMs ?? '—'}ms · slot ${provider.currentSlot ?? '—'}`])} empty={<EmptyState title="No RPC provider rows" detail={rpcSummary?.providerSummary ?? 'RPC summary unavailable.'} />} />
    <DataTable className="preLiveChecklistTable" head={['Check', 'Status', 'Owner', 'Evidence']} rows={(checklist?.items ?? []).map((item) => [item.label, <span className={item.status === 'pass' ? 'positivePnlCell' : item.status === 'warn' ? 'neutralPnlCell' : 'negativePnlCell'}>{item.status}</span>, item.owner, item.evidence])} empty={<EmptyState title="No checklist rows" detail="Pre-live checklist data is loading or unavailable." />} />
    <PreLiveDryRunAction projectId={projectId} />
  </div>;
}

function InstantTradeTab({ activeMint, wallets, selectedWallet, selectedPosition, selectedWalletId, onSelectWallet, side, onSide, amount, onAmount, slippage, onSlippage, capabilities, quote, quoteStatus, onPreview }: { activeMint: string; wallets: TerminalWallet[]; selectedWallet: TerminalWallet | null; selectedPosition: PositionRow | null; selectedWalletId: string; onSelectWallet: (value: string) => void; side: 'Buy' | 'Sell'; onSide: (value: 'Buy' | 'Sell') => void; amount: string; onAmount: (value: string) => void; slippage: string; onSlippage: (value: string) => void; capabilities: ExecutionCapabilities | null; quote: QuotePayload | null; quoteStatus: string; onPreview: () => void }) {
  const live = Boolean(capabilities?.liveTradingEnabled);
  const routeLabels = quote?.quote?.routeLabels?.length ? quote.quote.routeLabels.join(' / ') : 'quote required';
  return <div className="axiomIntelSurface instantTradeIntelSurface"><div className="axiomSafetyBanner"><strong>{live ? 'Live gate reports enabled — browser wallet still required' : 'Live execution disabled'}</strong><span>{capabilities?.disabledReason ?? 'Quote previews only. No signing, no swap build, no broadcast from this tab.'}</span></div><div className="instantTradeGrid"><label><span>Wallet</span><select value={selectedWalletId} onChange={(event) => onSelectWallet(event.target.value)}>{wallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.role} · {compactAddress(wallet.address)}</option>)}</select></label><label><span>Side</span><select value={side} onChange={(event) => onSide(event.target.value as 'Buy' | 'Sell')}><option>Buy</option><option>Sell</option></select></label><label><span>Amount SOL</span><input value={amount} onChange={(event) => onAmount(event.target.value)} /></label><label><span>Slippage bps</span><input value={slippage} onChange={(event) => onSlippage(event.target.value)} /></label><button type="button" onClick={onPreview} disabled={!activeMint || quoteStatus === 'quoting'}>{quoteStatus === 'quoting' ? 'Quoting…' : 'Preview quote only'}</button></div><div className="axiomIntelChips"><Chip label="Mint" value={activeMint ? compactAddress(activeMint) : 'load token'} /><Chip label="Wallet" value={selectedWallet ? `${selectedWallet.role} · ${compactAddress(selectedWallet.address)}` : 'none'} /><Chip label="SOL bal" value={selectedWallet ? `${formatNumber(selectedWallet.balanceSol)} SOL` : '—'} /><Chip label="Token bal" value={selectedPosition ? formatNumber(selectedPosition.uiAmount) : '0'} /><Chip label="Token value" value={formatUsd(selectedPosition?.valueUsd)} /><Chip label="Balance src" value={selectedPosition?.status ?? (selectedWallet ? 'tracked-empty' : 'no-wallet')} /><Chip label="Signer" value={capabilities?.signer ?? 'browser-wallet required'} /><Chip label="Broadcaster" value={capabilities?.broadcaster ?? 'disabled until signed payload'} /><Chip label="Safety" value={quote?.safety ?? quoteStatus} tone={quote?.status === 'error' ? 'bad' : 'neutral'} /></div><DataTable head={['Quote field', 'Value', 'Source']} rows={quote ? [['Status', quote.status ?? quoteStatus, quote.execution ?? 'quote-preview'], ['Expected out', quote.quote?.outAmount ?? '—', 'Jupiter quote-only'], ['Impact', quote.quote?.priceImpactPct ?? '—', 'Jupiter quote-only'], ['Route', routeLabels, 'route plan'], ['Request', `${quote.request?.side ?? side} ${quote.request?.amount ?? amount}`, 'no transaction built here']] : []} empty={<EmptyState title="No quote yet" detail="Preview quote calls `/api/execution-quote` only. This tab does not sign, swap, or broadcast." />} /></div>;
}
