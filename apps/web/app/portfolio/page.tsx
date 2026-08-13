import { buildMeridianHubContext } from '../../lib/meridian-context';
import { getMeridianWalletStore } from '../../lib/durable-wallet-store';
import { meridianSessionStatus } from '../../lib/meridian-auth';
import { buildPortfolioSnapshot } from '../../lib/portfolio-snapshot';
import { buildPortfolioTimeseries } from '../../lib/portfolio-timeseries';
import { buildPreLiveChecklist } from '../../lib/pre-live-checklist';
import { getSolanaRpcHealth } from '../../lib/rpc-health';
import { MeridianStatusBadge } from '../components/MeridianStatusBadge';
import { PortfolioPnlChart } from './components/PortfolioPnlChart';
import { WalletRailStatus } from '../components/WalletRailStatus';

export const dynamic = 'force-dynamic';

type PortfolioPageProps = {
  searchParams?: Promise<{ view?: string; tab?: string; q?: string; archived?: string; project?: string; mint?: string; range?: string }>; 
};

type Json = Record<string, unknown>;

function shortAddress(address: string) {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-5)}` : address;
}

function money(value: unknown, fallback = '$0') {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return number.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: Math.abs(number) >= 1000 ? 0 : 2 });
}

function numberText(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function walletSolText(wallet: Json) {
  const status = text(wallet.balanceStatus, 'unknown');
  if (status !== 'live') return `${status === 'provider-limited' ? 'provider-limited' : status === 'modeled' ? 'modeled' : 'unavailable'} · SOL not live`;
  return `${numberText(wallet.solBalance)} SOL · live`;
}

function asRows(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((row): row is Json => Boolean(row) && typeof row === 'object' && !Array.isArray(row)) : [];
}

function text(value: unknown, fallback = '—') {
  return typeof value === 'string' && value ? value : fallback;
}

function safeDisplay(value: unknown, fallback = '—') {
  const raw = text(value, fallback);
  return raw
    .replace(/private[_ -]?key/gi, 'sensitive credential')
    .replace(/seed[_ -]?phrase|mnemonic/gi, 'sensitive credential')
    .replace(/[A-Z0-9_]*API_KEY/g, 'optional provider credential')
    .replace(/SOLANA_RPC_URL\.rtf/g, 'local RPC note');
}

export default async function PortfolioPage({ searchParams }: PortfolioPageProps) {
  const params = await searchParams;
  const view = params?.view ?? 'spot';
  const tableTab = params?.tab ?? 'active';
  const search = (params?.q ?? '').toLowerCase();
  const store = await getMeridianWalletStore();
  const hubContext = buildMeridianHubContext(params?.project ?? null, store);
  const selectedContext = hubContext.activeProjectId ? hubContext.projects[0] : undefined;
  const scopedMint = params?.mint ?? selectedContext?.terminal.mint ?? null;
  const rpcHealth = await getSolanaRpcHealth();
  const session = await meridianSessionStatus();
  const preLiveChecklist = buildPreLiveChecklist({ project: selectedContext?.project ?? null, wallets: selectedContext?.wallets ?? store.wallets.filter((wallet) => !wallet.archived), rpc: rpcHealth, auth: session });
  const projectParam = selectedContext ? `&project=${selectedContext.project.id}` : '';
  const mintParam = scopedMint ? `&mint=${scopedMint}` : '';
  const snapshot = await buildPortfolioSnapshot(store);
  const timeseries = await buildPortfolioTimeseries(params?.range);
  const wallets = asRows(snapshot.wallets.data.rows);
  const holdings = asRows(snapshot.holdings.data.rows);
  const activePositions = asRows(snapshot.positions.data.active).filter((row) => {
    if (!search) return true;
    return [row.name, row.symbol, row.mint].some((value) => String(value ?? '').toLowerCase().includes(search));
  });
  const history = asRows(snapshot.positions.data.history).filter((row) => {
    if (!search) return true;
    return [row.projectId, row.type].some((value) => String(value ?? '').toLowerCase().includes(search));
  }).slice(0, 100);
  const top100 = asRows(snapshot.positions.data.top100).filter((row) => {
    if (!search) return true;
    return [row.name, row.symbol, row.mint].some((value) => String(value ?? '').toLowerCase().includes(search));
  }).slice(0, 100);
  const activity = asRows(snapshot.activity.data.rows);
  const performance = snapshot.performance.data;
  const buckets = (performance.buckets && typeof performance.buckets === 'object' ? performance.buckets : {}) as Json;
  const blockingIssues = Array.isArray(snapshot.blockingIssues) ? snapshot.blockingIssues : [];
  const optionalProviderGaps = Array.isArray(snapshot.optionalProviderGaps) ? snapshot.optionalProviderGaps : [];
  const providerNotes = Array.isArray(snapshot.providerNotes) ? snapshot.providerNotes : [];
  const providerHealth = snapshot.providerHealth.data as Json;
  const sourceCards = [
    ['RPC', ((providerHealth.solanaRpc as Json | undefined)?.status ?? 'unknown'), ((providerHealth.solanaRpc as Json | undefined)?.note ?? providerNotes[0] ?? 'Solana RPC status unavailable.')],
    ['Helius', ((providerHealth.helius as Json | undefined)?.status ?? 'unknown'), ((providerHealth.helius as Json | undefined)?.note ?? 'Optional enhanced history provider.')],
    ['Birdeye', ((providerHealth.birdeye as Json | undefined)?.status ?? 'unknown'), ((providerHealth.birdeye as Json | undefined)?.note ?? 'Optional token transaction provider.')],
    ['Jupiter', ((providerHealth.jupiter as Json | undefined)?.status ?? 'unknown'), ((providerHealth.jupiter as Json | undefined)?.note ?? 'No-key price fallback.')],
  ];
  const blockingNote = blockingIssues.length ? blockingIssues.join(' · ') : '';
  const pnlLabel = text(performance.pnlStatus, optionalProviderGaps.length ? 'Needs provider history' : 'Estimated');

  return (
    <main className="portfolioMainSurface">
      <section className="portfolioShell">
        <header className="portfolioHeader">
          <div>
            <div className="portfolioProductTabs" aria-label="Portfolio products">
              {['spot', 'wallets'].map((item) => <a className={view === item ? 'active' : ''} href={`/portfolio?view=${item}${selectedContext ? `&project=${selectedContext.project.id}` : ''}`} key={item}>{item === 'spot' ? 'Spot' : 'Wallets'}</a>)}
            </div>
            <form className="portfolioSearch" action="/portfolio">
              <input type="hidden" name="view" value={view} />
              {selectedContext && <input type="hidden" name="project" value={selectedContext.project.id} />}
              <span>Search for other wallets...</span>
              <input name="q" placeholder="Search by name or address" defaultValue={params?.q ?? ''} />
            </form>
          </div>
          <div className="portfolioNetworkCard">
            <strong>BONDR Portfolio</strong>
            <span>Solana · {snapshot.status}</span>
            <em>{numberText(snapshot.wallets.data.totalSol)} SOL</em>
          </div>
        </header>

        <MeridianStatusBadge projectName={selectedContext?.project.name} checklistState={preLiveChecklist.state} checklistWarnings={preLiveChecklist.warnings} checklistFailed={preLiveChecklist.failed} rpcStatus={rpcHealth.status} rpcProviderLabel={rpcHealth.selectedProviderLabel} rpcQuotaLimited={rpcHealth.quotaLimited} dryRunStatus={selectedContext?.project.preLiveDryRun?.status ?? null} />
        <WalletRailStatus surface="portfolio" selectedWalletAddress={selectedContext?.wallets[0]?.address ?? null} activeMint={scopedMint} />


        {selectedContext && (
          <section className="portfolioDegradedBanner">
            <strong>{selectedContext.project.name} · launch accounting context</strong>
            <span>
              {selectedContext.project.ticker} · {selectedContext.deployment.stage} · saved funding state {selectedContext.fundingPlan.status} · 30d stored net flow {selectedContext.portfolio.flow30d.netSol.toFixed(4)} SOL · balances may be provider-limited until live RPC hydration. <a href={`/deployment?project=${selectedContext.project.id}`}>Deployment</a> · <a href={`/wallets?project=${selectedContext.project.id}`}>Wallets</a> · <a href={scopedMint ? `/sniper?mint=${scopedMint}&project=${selectedContext.project.id}` : selectedContext.terminal.href}>Terminal</a>
            </span>
          </section>
        )}

        {blockingIssues.length > 0 && <div className="portfolioDegradedBanner"><strong>Data issue</strong><span>{blockingNote}</span></div>}
        <section className="portfolioProviderStrip" aria-label="Portfolio data sources">
          {sourceCards.map(([label, status, note]) => <div className="portfolioProviderPill" key={String(label)} title={safeDisplay(note)}><span>{String(label)}</span><strong>{String(status).replace(/-/g, ' ')}</strong></div>)}
        </section>



        {view === 'wallets' ? (
          <section className="portfolioWalletsView">
            <div className="portfolioPanelTitle"><div><span>BONDR Portfolio</span><strong>Wallets</strong><small>Saved public wallet records and provider-backed balances when available.</small></div><div className="portfolioActionStack"><a href="/wallets">Manage Wallets</a></div></div>
            <div className="portfolioTable walletPortfolioTable" role="table" aria-label="Portfolio wallets">
              <div className="portfolioRow portfolioHead" role="row"><span>Wallet</span><span>Balance</span><span>Holdings</span><span>Actions</span></div>
              {wallets.map((wallet) => <div className="portfolioRow" role="row" key={String(wallet.id)}><strong>{text(wallet.role, 'Wallet')}</strong><span title={text(wallet.note)}>{walletSolText(wallet)}</span><span>{text(wallet.groupId)} · {money(wallet.solValueUsd, 'price unavailable')}</span><span><a href="/wallets">Wallet Ops</a></span></div>)}
            </div>
            
          </section>
        ) : (
          <>
            <section className="portfolioTimeTabs" aria-label="Portfolio time range">{['1d', '7d', '30d', 'max'].map((range) => <a className={timeseries.range === range ? 'active' : ''} href={`/portfolio?range=${range}${projectParam}${mintParam}`} key={range}>{range === 'max' ? 'Max' : range}</a>)}</section>
            <section className="portfolioMetricsGrid">
              <article className="portfolioBalanceCard"><span>Balance</span><small>USD</small><strong>{money(performance.totalValueUsd)}</strong><p>Total Value</p><strong>{money(performance.totalValueUsd)}</strong><p>Unrealized PNL</p><strong>{money(performance.unrealizedPnlUsd, 'unavailable')}</strong><PortfolioPnlChart timeseries={timeseries} /><p>Tradeable Balance</p><strong>{money(performance.tradeableBalanceUsd, 'price unavailable')}</strong><p>Realized PNL</p><strong>{money(performance.realizedPnlUsd, 'unavailable')}</strong><p>{pnlLabel}</p></article>
              <article className="portfolioPerformanceCard"><span>Performance</span><div className="performanceGrid"><div><small>Total Pnl</small><strong>{money(performance.totalPnlUsd, 'unavailable')}</strong></div><div><small>Realized PNL</small><strong>{money(performance.realizedPnlUsd, 'unavailable')}</strong></div><div><small>Total TXNS</small><strong>{numberText(performance.totalTxns)}</strong><em>{numberText(performance.buys)} / {numberText(performance.sells)}</em></div>{['>500%', '200% ~ 500%', '0% ~ 200%', '0% ~ -50%', '< -50%'].map((bucket) => <div key={bucket}><small>{bucket}</small><strong>{numberText(buckets[bucket])}</strong></div>)}</div></article>
            </section>

            <section className="portfolioPositionsPanel">
              <div className="portfolioPanelTitle"><div className="portfolioInnerTabs"><a className={tableTab === 'active' ? 'active' : ''} href={`/portfolio?tab=active${projectParam}${mintParam}`}>Active Positions</a><a className={tableTab === 'history' ? 'active' : ''} href={`/portfolio?tab=history${projectParam}${mintParam}`}>History</a><a className={tableTab === 'top100' ? 'active' : ''} href={`/portfolio?tab=top100${projectParam}${mintParam}`}>Top 100</a></div><form className="portfolioInlineSearch" action="/portfolio"><input type="hidden" name="view" value="spot" />{selectedContext && <input type="hidden" name="project" value={selectedContext.project.id} />}{scopedMint && <input type="hidden" name="mint" value={scopedMint} />}<input type="hidden" name="tab" value={tableTab} /><input name="q" placeholder="Search by name or address" defaultValue={params?.q ?? ''} /></form><div className="portfolioActionStack"><button disabled>USD</button></div></div>
              {tableTab === 'history' ? <div className="portfolioTable historyTable" role="table"><div className="portfolioRow portfolioHead"><span>Type</span><span>Token</span><span>Amount</span><span>Market Cap</span><span>Age</span><span>Explorer</span></div>{history.length ? history.map((event) => <div className="portfolioRow" key={String(event.id)}><strong>{text(event.type)}</strong><span>{text(event.projectId)}</span><span>{numberText(event.tokenAmount)} · {numberText(event.solAmount)} SOL</span><span>—</span><span>{String(event.timestamp ?? '').slice(0, 10) || '—'}</span><span>—</span></div>) : <div className="emptyPortfolioState">No activity</div>}</div> : tableTab === 'top100' ? <div className="portfolioTable" role="table"><div className="portfolioRow portfolioHead"><span>Token</span><span>Bought</span><span>Sold</span><span>Remaining</span><span>PNL</span><span>Action</span></div>{top100.length ? top100.map((row) => <div className="portfolioRow" key={String(row.projectId)}><strong>{text(row.symbol, text(row.name, 'Token'))}</strong><span>{numberText(row.bought)}</span><span>{numberText(row.sold)}</span><span>{numberText(row.remaining)}</span><span className={Number(row.totalPnlUsd ?? 0) >= 0 ? 'profitText' : 'dangerText'}>{money(row.totalPnlUsd, text(row.pnlStatus, 'unavailable'))}</span><span>{row.mint ? <a href={`/sniper?mint=${row.mint}&project=${row.projectId}`}>Trade</a> : 'No mint'}</span></div>) : <div className="emptyPortfolioState">No top trades</div>}</div> : <div className="portfolioTable" role="table"><div className="portfolioRow portfolioHead"><span>Token</span><span>Bought</span><span>Sold</span><span>Remaining</span><span>PNL</span><span>Action</span></div>{activePositions.length ? activePositions.map((row) => <div className="portfolioRow" key={String(row.projectId)}><strong>{text(row.name, 'Token')} <em>{text(row.symbol)}</em></strong><span>{numberText(row.bought)}</span><span>{numberText(row.sold)}</span><span>{numberText(row.remaining)}</span><span className={Number(row.totalPnlUsd ?? 0) >= 0 ? 'profitText' : 'dangerText'}>{money(row.totalPnlUsd, text(row.pnlStatus, 'unavailable'))}</span><span>{row.mint ? <a href={`/sniper?mint=${row.mint}&project=${row.projectId}`}>Trade</a> : 'No mint'}</span></div>) : <div className="emptyPortfolioState">No active positions</div>}</div>}
            </section>

            <section className="portfolioActivityPanel"><h2>Activity</h2><div className="portfolioTable historyTable"><div className="portfolioRow portfolioHead"><span>Transfers</span><span>Type</span><span>Token</span><span>Amount</span><span>Age</span><span>Explorer</span></div>{activity.slice(0, 12).map((row) => <div className="portfolioRow" key={String(row.id)}><strong>Wallet</strong><span>{safeDisplay(row.type)}</span><span>{text(row.walletId)}</span><span>{safeDisplay(row.message)}</span><span>{String(row.timestamp ?? '').slice(0, 10) || '—'}</span><span>—</span></div>)}</div></section>

            <section className="portfolioActivityPanel"><h2>SPL Holdings</h2><div className="portfolioTable" role="table"><div className="portfolioRow portfolioHead"><span>Token</span><span>Mint</span><span>Amount</span><span>Wallets</span><span>Value</span><span>Source</span></div>{holdings.length ? holdings.slice(0, 100).map((row) => <div className="portfolioRow" key={String(row.mint)}><strong>{text(row.symbol, text(row.name, 'Unknown'))}</strong><span>{shortAddress(String(row.mint))}</span><span>{numberText(row.uiAmount)}</span><span>{numberText(row.walletCount)}</span><span>{money(row.valueUsd, 'price unavailable')}</span><span>RPC + Jupiter</span></div>) : <div className="emptyPortfolioState">No non-zero SPL holdings found in scanned wallets</div>}</div></section>
          </>
        )}
      </section>
    </main>
  );
}
