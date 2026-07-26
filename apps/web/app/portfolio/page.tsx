import { buildPortfolioSnapshot } from '../../lib/portfolio-snapshot';

export const dynamic = 'force-dynamic';

type PortfolioPageProps = {
  searchParams?: Promise<{ view?: string; tab?: string; q?: string; archived?: string }>;
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

function asRows(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((row): row is Json => Boolean(row) && typeof row === 'object' && !Array.isArray(row)) : [];
}

function text(value: unknown, fallback = '—') {
  return typeof value === 'string' && value ? value : fallback;
}

export default async function PortfolioPage({ searchParams }: PortfolioPageProps) {
  const params = await searchParams;
  const view = params?.view ?? 'spot';
  const tableTab = params?.tab ?? 'active';
  const search = (params?.q ?? '').toLowerCase();
  const snapshot = await buildPortfolioSnapshot();
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
    ['Bitquery', ((providerHealth.bitquery as Json | undefined)?.status ?? 'unknown'), ((providerHealth.bitquery as Json | undefined)?.note ?? 'Optional bundle clustering provider.')],
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
              {['spot', 'wallets'].map((item) => <a className={view === item ? 'active' : ''} href={`/portfolio?view=${item}`} key={item}>{item === 'spot' ? 'Spot' : 'Wallets'}</a>)}
            </div>
            <form className="portfolioSearch" action="/portfolio">
              <input type="hidden" name="view" value={view} />
              <span>Search for other wallets...</span>
              <input name="q" placeholder="Search by name or address" defaultValue={params?.q ?? ''} />
            </form>
          </div>
          <div className="portfolioNetworkCard">
            <strong>Axiom Main</strong>
            <span>Solana · {snapshot.status}</span>
            <em>{numberText(snapshot.wallets.data.totalSol)} SOL</em>
          </div>
        </header>

        {blockingIssues.length > 0 && <div className="portfolioDegradedBanner"><strong>Data issue</strong><span>{blockingNote}</span></div>}
        <section className="portfolioProviderStrip" aria-label="Portfolio data sources">
          {sourceCards.map(([label, status, note]) => <div className="portfolioProviderPill" key={String(label)} title={String(note)}><span>{String(label)}</span><strong>{String(status).replace(/-/g, ' ')}</strong></div>)}
        </section>

        {view === 'wallets' ? (
          <section className="portfolioWalletsView">
            <div className="portfolioPanelTitle"><div><span>Axiom Main</span><strong>Wallets</strong><small>Connected to Meridian terminal wallets via /api/portfolio.</small></div><div className="portfolioActionStack"><button disabled>Import</button><button disabled>Export</button><button disabled>Create</button></div></div>
            <div className="portfolioTable walletPortfolioTable" role="table" aria-label="Portfolio wallets">
              <div className="portfolioRow portfolioHead" role="row"><span>Wallet</span><span>Balance</span><span>Holdings</span><span>Actions</span></div>
              {wallets.map((wallet) => <div className="portfolioRow" role="row" key={String(wallet.id)}><strong>{text(wallet.role, 'Wallet')}</strong><span title={text(wallet.note)}>{numberText(wallet.solBalance)} SOL · {text(wallet.balanceStatus)}</span><span>{text(wallet.groupId)} · {money(wallet.solValueUsd, 'price unavailable')}</span><span><button disabled>Open</button><button disabled>Distribute</button></span></div>)}
            </div>
            <div className="sourceWalletDropzone">Drag wallets to distribute SOL</div>
          </section>
        ) : (
          <>
            <section className="portfolioTimeTabs" aria-label="Portfolio time range"><button>1d</button><button>7d</button><button>30d</button><button>Max</button></section>
            <section className="portfolioMetricsGrid">
              <article className="portfolioBalanceCard"><span>Balance</span><small>USD</small><strong>{money(performance.totalValueUsd)}</strong><p>Total Value</p><strong>{money(performance.totalValueUsd)}</strong><p>Unrealized PNL</p><strong>{money(performance.unrealizedPnlUsd, 'unavailable')}</strong><div className="portfolioChartPlaceholder">Realized PNL<br />{pnlLabel}</div><p>Tradeable Balance</p><strong>{money(performance.tradeableBalanceUsd, 'price unavailable')}</strong><p>Realized PNL</p><strong>{money(performance.realizedPnlUsd, 'unavailable')}</strong></article>
              <article className="portfolioPerformanceCard"><span>Performance</span><div className="performanceGrid"><div><small>Total Pnl</small><strong>{money(performance.totalPnlUsd, 'unavailable')}</strong></div><div><small>Realized PNL</small><strong>{money(performance.realizedPnlUsd, 'unavailable')}</strong></div><div><small>Total TXNS</small><strong>{numberText(performance.totalTxns)}</strong><em>{numberText(performance.buys)} / {numberText(performance.sells)}</em></div>{['>500%', '200% ~ 500%', '0% ~ 200%', '0% ~ -50%', '< -50%'].map((bucket) => <div key={bucket}><small>{bucket}</small><strong>{numberText(buckets[bucket])}</strong></div>)}</div></article>
            </section>

            <section className="portfolioPositionsPanel">
              <div className="portfolioPanelTitle"><div className="portfolioInnerTabs"><a className={tableTab === 'active' ? 'active' : ''} href="/portfolio?tab=active">Active Positions</a><a className={tableTab === 'history' ? 'active' : ''} href="/portfolio?tab=history">History</a><a className={tableTab === 'top100' ? 'active' : ''} href="/portfolio?tab=top100">Top 100</a></div><form className="portfolioInlineSearch" action="/portfolio"><input type="hidden" name="view" value="spot" /><input type="hidden" name="tab" value={tableTab} /><input name="q" placeholder="Search by name or address" defaultValue={params?.q ?? ''} /></form><div className="portfolioActionStack"><button disabled>Optimize Dust</button><button disabled>Show Hidden</button><button>USD</button></div></div>
              {tableTab === 'history' ? <div className="portfolioTable historyTable" role="table"><div className="portfolioRow portfolioHead"><span>Type</span><span>Token</span><span>Amount</span><span>Market Cap</span><span>Age</span><span>Explorer</span></div>{history.length ? history.map((event) => <div className="portfolioRow" key={String(event.id)}><strong>{text(event.type)}</strong><span>{text(event.projectId)}</span><span>{numberText(event.tokenAmount)} · {numberText(event.solAmount)} SOL</span><span>—</span><span>{String(event.timestamp ?? '').slice(0, 10) || '—'}</span><span>—</span></div>) : <div className="emptyPortfolioState">No activity</div>}</div> : tableTab === 'top100' ? <div className="portfolioTable" role="table"><div className="portfolioRow portfolioHead"><span>Token</span><span>Bought</span><span>Sold</span><span>Remaining</span><span>PNL</span><span>Action</span></div>{top100.length ? top100.map((row) => <div className="portfolioRow" key={String(row.projectId)}><strong>{text(row.symbol, text(row.name, 'Token'))}</strong><span>{numberText(row.bought)}</span><span>{numberText(row.sold)}</span><span>{numberText(row.remaining)}</span><span className={Number(row.totalPnlUsd ?? 0) >= 0 ? 'profitText' : 'dangerText'}>{money(row.totalPnlUsd, text(row.pnlStatus, 'unavailable'))}</span><span>{row.mint ? <a href={`/sniper?mint=${row.mint}&project=${row.projectId}`}>Trade</a> : 'No mint'}</span></div>) : <div className="emptyPortfolioState">No top trades</div>}</div> : <div className="portfolioTable" role="table"><div className="portfolioRow portfolioHead"><span>Token</span><span>Bought</span><span>Sold</span><span>Remaining</span><span>PNL</span><span>Action</span></div>{activePositions.length ? activePositions.map((row) => <div className="portfolioRow" key={String(row.projectId)}><strong>{text(row.name, 'Token')} <em>{text(row.symbol)}</em></strong><span>{numberText(row.bought)}</span><span>{numberText(row.sold)}</span><span>{numberText(row.remaining)}</span><span className={Number(row.totalPnlUsd ?? 0) >= 0 ? 'profitText' : 'dangerText'}>{money(row.totalPnlUsd, text(row.pnlStatus, 'unavailable'))}</span><span>{row.mint ? <a href={`/sniper?mint=${row.mint}&project=${row.projectId}`}>Trade</a> : 'No mint'}</span></div>) : <div className="emptyPortfolioState">No active positions</div>}</div>}
            </section>

            <section className="portfolioActivityPanel"><h2>Activity</h2><div className="portfolioTable historyTable"><div className="portfolioRow portfolioHead"><span>Transfers</span><span>Type</span><span>Token</span><span>Amount</span><span>Age</span><span>Explorer</span></div>{activity.slice(0, 12).map((row) => <div className="portfolioRow" key={String(row.id)}><strong>Wallet</strong><span>{text(row.type)}</span><span>{text(row.walletId)}</span><span>{text(row.message)}</span><span>{String(row.timestamp ?? '').slice(0, 10) || '—'}</span><span>—</span></div>)}</div></section>

            <section className="portfolioActivityPanel"><h2>SPL Holdings</h2><div className="portfolioTable" role="table"><div className="portfolioRow portfolioHead"><span>Token</span><span>Mint</span><span>Amount</span><span>Wallets</span><span>Value</span><span>Source</span></div>{holdings.length ? holdings.slice(0, 100).map((row) => <div className="portfolioRow" key={String(row.mint)}><strong>{text(row.symbol, text(row.name, 'Unknown'))}</strong><span>{shortAddress(String(row.mint))}</span><span>{numberText(row.uiAmount)}</span><span>{numberText(row.walletCount)}</span><span>{money(row.valueUsd, 'price unavailable')}</span><span>RPC + Jupiter</span></div>) : <div className="emptyPortfolioState">No non-zero SPL holdings found in scanned wallets</div>}</div></section>
          </>
        )}
      </section>
    </main>
  );
}
