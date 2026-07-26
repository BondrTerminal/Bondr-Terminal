import { hydrateWalletBalances, displayWalletSol } from '../../lib/chain-hydration';
import { getMeridianStore, getProject, walletBalanceSummary } from '../../lib/meridian-store';

export const dynamic = 'force-dynamic';

const walletActions = [
  ['Export', 'Export public wallet records and audit metadata. Key material remains provider-side only.'],
  ['Archive', 'Move selected wallet records out of the active dashboard while preserving audit history.'],
  ['Delete', 'Danger action routed through archive-first recovery, confirmations, and audit rules.'],
  ['Create', 'Create flow routes through browser wallet/Turnkey provider; server-side private-key generation is blocked.'],
  ['Import', 'Public-address import is server-safe; private-key import must stay inside the wallet provider.'],
  ['Fund / Collect', 'Wallet Ops engine builds gated unsigned transfer transactions for browser-wallet signing.']
];

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-5)}`;
}

type WalletsPageProps = { searchParams?: Promise<{ project?: string }> };

export default async function WalletsPage({ searchParams }: WalletsPageProps) {
  const params = await searchParams;
  const store = getMeridianStore();
  const selectedProject = params?.project ? getProject(params.project, store) : undefined;
  const summary = walletBalanceSummary(store);
  const hydration = await hydrateWalletBalances(store.wallets);
  const hydratedWalletById = new Map(hydration.wallets.map((wallet) => [wallet.id, wallet]));
  const activeHydratedWallets = hydration.wallets.filter((wallet) => !wallet.archived);
  const archivedHydratedWallets = hydration.wallets.filter((wallet) => wallet.archived);
  const liveTotalSol = activeHydratedWallets.reduce((total, wallet) => total + displayWalletSol(wallet), 0);
  const groupRows = store.walletGroups.map((group) => {
    const wallets = group.walletIds.map((walletId) => hydratedWalletById.get(walletId)).filter(Boolean) as typeof hydration.wallets;
    const activeWallets = wallets.filter((wallet) => !wallet.archived);
    const archivedWallets = wallets.filter((wallet) => wallet.archived);
    const balance = activeWallets.reduce((total, wallet) => total + displayWalletSol(wallet), 0);
    const attachedProjects = store.projects.filter((project) => project.walletGroupId === group.id);
    const readiness = activeWallets.length === 0 ? 'blocked' : balance > 0 ? 'funded' : 'empty';
    return { group, activeWallets, archivedWallets, balance, attachedProjects, readiness };
  });

  const visibleActiveWallets = selectedProject
    ? activeHydratedWallets.filter((wallet) => wallet.groupId === selectedProject.walletGroupId)
    : activeHydratedWallets;
  const visibleArchivedWallets = selectedProject
    ? archivedHydratedWallets.filter((wallet) => wallet.groupId === selectedProject.walletGroupId)
    : archivedHydratedWallets;

  const walletScopes = [
    ['Active wallets', String(summary.activeWallets.length), 'Visible wallets in project/global operations.'],
    ['Archived wallets', String(summary.archivedWallets.length), 'Hidden from active ops but retained for audit.'],
    ['Groups', String(store.walletGroups.length), 'Project/global wallet grouping model.'],
    ['Live balance', `${liveTotalSol.toFixed(4)} SOL`, `${hydration.provider} · ${hydration.configured ? 'configured RPC' : 'public fallback'}`]
  ];

  return (
    <main>
      <div className="contentShell">
        <section className="documentHero oceanHero walletOpsHero">
          <div className="eyebrow">Wallet Ops</div>
          <h1>Wallet dashboard and operations feed.</h1>
          <p>
            Clean wallet control surface for active balances, project/global groups, archived wallets,
            wallet event history, and safe export/archive/delete action planning.
          </p>
        </section>

        <section className="walletDashboardGrid" aria-label="Wallet dashboard summary">
          {walletScopes.map(([label, value, detail]) => (
            <div className="projectStat" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </section>

        {selectedProject && (
          <section className="documentCard selectedProjectBanner">
            <span>Selected project</span>
            <strong>{selectedProject.name}</strong>
            <p>Wallet dashboard filtered to group {selectedProject.walletGroupId}.</p>
            <a href={`/projects/${selectedProject.id}`}>Open project cockpit</a>
          </section>
        )}

        <section className="walletOpsLayout">
          <section className="documentCard walletManagementPanel">
            <div className="sectionIntro compactIntro">
              <span>Dashboard</span>
              <h2>Active wallet / balance board</h2>
              <p>Active wallets only. Archived wallets are kept out of the main operating view to keep the dashboard clean.</p>
            </div>
            <div className="walletTable" role="table" aria-label="Active wallet balances">
              <div className="walletRow walletDashboardRow walletHead" role="row">
                <span>Role</span><span>Wallet</span><span>Balance</span><span>Scope</span><span>Group</span><span>Status</span><span>Actions</span>
              </div>
              {visibleActiveWallets.map((wallet) => (
                <div className="walletRow walletDashboardRow" role="row" key={wallet.id}>
                  <span>{wallet.role}</span>
                  <strong>{shortAddress(wallet.address)}</strong>
                  <span title={wallet.balanceNote}>{displayWalletSol(wallet).toFixed(4)} SOL · {wallet.balanceStatus}</span>
                  <span>{wallet.scope}</span>
                  <span>{store.walletGroups.find((group) => group.id === wallet.groupId)?.name ?? wallet.groupId}</span>
                  <em>{wallet.status}</em>
                  <div className="walletMiniActions">
                    <button type="button" disabled>Export</button>
                    <button type="button" disabled>Archive</button>
                    <button type="button" disabled>Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <p className="disabledNote">Export/archive/delete actions are displayed with their backend custody boundaries. Funded movement uses /api/wallet-ops-engine.</p>
          </section>

          <aside className="documentCard walletFeedPanel">
            <div className="sectionIntro compactIntro">
              <span>Feed</span>
              <h2>Wallet operations feed</h2>
              <p>Audit trail for balance observations, readiness warnings, terminal attachments, and archive events.</p>
            </div>
            <div className="walletFeedList">
              {summary.activity.map((activity) => {
                const wallet = store.wallets.find((item) => item.id === activity.walletId);
                return (
                  <article className="walletFeedItem" key={activity.id}>
                    <span className={activity.status === 'warn' ? 'dangerText' : 'profitText'}>{activity.type}</span>
                    <strong>{wallet?.role ?? activity.walletId}</strong>
                    <p>{activity.message}</p>
                  </article>
                );
              })}
            </div>
          </aside>
        </section>

        <section className="documentCard walletGroupReadinessPanel">
          <div className="sectionIntro compactIntro">
            <span>Groups</span>
            <h2>Wallet group readiness</h2>
            <p>Deployment services compete on clean wallet grouping. This view shows which groups are attached, empty, funded, or archived.</p>
          </div>
          <div className="projectTable" role="table" aria-label="Wallet group readiness">
            <div className="projectRow walletGroupRow projectHead" role="row">
              <span>Group</span><span>Scope</span><span>Active</span><span>Archived</span><span>Balance</span><span>Projects</span><span>Readiness</span>
            </div>
            {groupRows.map(({ group, activeWallets, archivedWallets, balance, attachedProjects, readiness }) => (
              <div className="projectRow walletGroupRow" role="row" key={group.id}>
                <strong>{group.name}</strong>
                <span>{group.scope}</span>
                <span>{activeWallets.length}</span>
                <span>{archivedWallets.length}</span>
                <span>{balance.toFixed(4)} SOL</span>
                <span>{attachedProjects.map((project) => project.name).join(', ') || 'Unassigned'}</span>
                <em className={readiness === 'funded' ? 'profitText' : readiness === 'blocked' ? 'dangerText' : ''}>{readiness}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="documentCard walletActionConsole">
          <div className="sectionIntro compactIntro">
            <span>Actions</span>
            <h2>Export / archive / delete options</h2>
            <p>Operator controls are backed by wallet-ops engine status; funded execution requires live gate and browser-wallet confirmation.</p>
          </div>
          <div className="walletActionGrid">
            {walletActions.map(([title, body]) => (
              <button className="walletActionButton" type="button" disabled key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="documentCard archiveWalletPanel">
          <div className="sectionIntro compactIntro">
            <span>Archive</span>
            <h2>Archived wallet list</h2>
            <p>Select/open archived wallets from the back of the dashboard without polluting active operations.</p>
          </div>
          <details className="archivedWalletDrawer">
            <summary>Open archived wallets ({visibleArchivedWallets.length})</summary>
            <div className="walletTable" role="table" aria-label="Archived wallet list">
              <div className="walletRow archivedWalletRow walletHead" role="row">
                <span>Role</span><span>Wallet</span><span>Balance</span><span>Group</span><span>Archived</span><span>Reason</span>
              </div>
              {visibleArchivedWallets.map((wallet) => (
                <div className="walletRow archivedWalletRow" role="row" key={wallet.id}>
                  <span>{wallet.role}</span>
                  <strong>{shortAddress(wallet.address)}</strong>
                  <span title={wallet.balanceNote}>{displayWalletSol(wallet).toFixed(4)} SOL · {wallet.balanceStatus}</span>
                  <span>{store.walletGroups.find((group) => group.id === wallet.groupId)?.name ?? wallet.groupId}</span>
                  <em>{wallet.archivedAt ? new Date(wallet.archivedAt).toISOString().slice(0, 10) : 'Archived'}</em>
                  <span>{wallet.archiveReason ?? 'No reason recorded'}</span>
                </div>
              ))}
            </div>
          </details>
        </section>

        <section className="documentCard quickDeployPanel">
          <div className="sectionIntro compactIntro">
            <span>Quick deploy</span>
            <h2>Default launch wallet settings</h2>
            <p>Data-backed launch wallet settings connect to wallet groups and wallet-ops engine state.</p>
          </div>
          <div className="deployFormPreview">
            <select disabled defaultValue="project-alpha">
              {store.walletGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
            <input placeholder="Default funding amount per wallet" />
            <select disabled defaultValue="treasury">
              {summary.activeWallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.role}</option>)}
            </select>
            <select disabled defaultValue="pumpfun">
              <option value="pumpfun">Pump.fun launch</option>
              <option value="raydium">Raydium launch</option>
            </select>
            <a className="button" href="/api/wallet-ops-engine" target="_blank" rel="noreferrer">Open wallet ops engine</a>
          </div>
          <p className="disabledNote">Settings use live wallet groups; transaction movement is routed through /api/wallet-ops-engine and browser-wallet signing.</p>
        </section>
      </div>
    </main>
  );
}
