import { eventsForProject, launchPreflight, readinessScore, walletsForGroup, type Project, type MeridianStore } from '../../lib/meridian-store';
import { getMeridianWalletStore } from '../../lib/durable-wallet-store';
import { getSolanaRpcHealth } from '../../lib/rpc-health';
import { LaunchConfigEditor } from './components/LaunchConfigEditor';
import { CreateProjectLauncher } from '../components/CreateProjectLauncher';
import { WalletRailStatus } from '../components/WalletRailStatus';

export const dynamic = 'force-dynamic';

const launchPaths = [
  ['Pump.fun launcher', 'Primary planned path', 'Guided launch flow: project setup, metadata, launch wallet, preflight, and post-launch monitoring.'],
  ['Raydium launcher', 'Planned advanced path', 'Pool/liquidity workflow with LP burn/lock disclosure and market-support handoff.'],
  ['Launch command center', 'Operator hub', 'Metadata, wallets, funding, launch mode, liquidity policy, risk disclosure, and monitor coverage.']
];

const guardedFeatures = [
  ['Wallet generation', 'Disabled until private-key storage, backup, and confirmation gates are deliberately designed.'],
  ['Batch sends', 'Routed through wallet/bundle engines with destination review, fee estimate, and explicit confirmation.'],
  ['Timed execution', 'Needs explicit review, purpose, and visible operator confirmation.'],
  ['Trading activity', 'Routed through terminal-order-engine, bundle-sequencer, Jupiter builders, risk caps, and browser-wallet signing.']
];

const launchControlGroups = [
  ['Metadata', ['Name / ticker', 'Description', 'Image', 'Social links']],
  ['Wallets', ['Launch wallet', 'Trading group', 'Treasury', 'Fee reserve']],
  ['Market', ['Launch path', 'Liquidity SOL', 'Dev buy cap', 'LP policy']],
  ['Execution', ['Preflight', 'Build tx', 'Schedule', 'Browser sign']]
];

const launchTasks = [
  ['Metadata image/socials', 'blocked', 'deployment'],
  ['Assign funded launch group', 'review', 'wallets'],
  ['Configure launch bundle', 'review', 'wallets'],
  ['Run launch preflight', 'review', 'deployment'],
  ['Post-launch monitor handoff', 'ready', 'projects'],
  ['Liquidity Engine review', 'blocked', 'liquidity']
];

const bundleSplit = [0.1, 0.075, 0.05, 0.05, 0.025];

function AllocationGraph({ project }: { project: Project }) {
  const items = [
    ['Liquidity', project.fundingPlan.liquiditySol],
    ['Fee reserve', project.fundingPlan.feeReserveSol],
    ['Dev buy', project.fundingPlan.devBuySol],
    ['Unassigned', Math.max(0, project.fundingPlan.budgetSol - project.fundingPlan.liquiditySol - project.fundingPlan.feeReserveSol - project.fundingPlan.devBuySol)]
  ];
  const max = Math.max(...items.map(([, value]) => Number(value)), 1);
  return (
    <div className="allocationGraph">
      {items.map(([label, value]) => (
        <div className="allocationBar" key={label}>
          <span>{label}</span>
          <div><i style={{ width: `${(Number(value) / max) * 100}%` }} /></div>
          <strong>{Number(value).toFixed(2)} SOL</strong>
        </div>
      ))}
    </div>
  );
}

function MonitorTable({ title, rows }: { title: string; rows: Array<{ label: string; value: string; detail: string }> }) {
  return (
    <article className="monitorTable">
      <h3>{title}</h3>
      <div className="monitorRows">
        {rows.map((row) => (
          <div className="monitorRow" key={`${title}-${row.label}`}>
            <strong>{row.label}</strong><span>{row.value}</span><span>{row.detail}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

type DeploymentPageProps = { searchParams?: Promise<{ project?: string }> };

export default async function DeploymentPage({ searchParams }: DeploymentPageProps) {
  const params = await searchParams;
  const rpc = await getSolanaRpcHealth();
  const store: MeridianStore = await getMeridianWalletStore();
  const selectedProject = params?.project ? store.projects.find((project) => project.id === params.project) : undefined;
  const projects = selectedProject ? [selectedProject] : store.projects;
  const activeProject = selectedProject ?? projects[0];
  const activeWallets = activeProject ? walletsForGroup(activeProject.walletGroupId, store).filter((wallet) => !wallet.archived) : [];

  return (
    <main>
      <div className="contentShell">
        <section className="documentHero oceanHero deploymentHero">
          <div className="eyebrow">Deployment</div>
          <h1>Token launch command center.</h1>
          <p>
            Data-backed launch workspace for Pump.fun/Raydium project preparation, metadata,
            wallet readiness, funding plans, launch preflight, transaction builders, and post-launch monitoring. Deployment execution, funding, and broadcast remain disabled in A-profile.
          </p>
          <div className="launchHeroStatus">
            <span>Deployment route</span>
            <strong>/deployment is restored</strong>
            <em>{activeProject ? `${activeProject.ticker} · ${activeProject.launchPath}` : `Create a project · ${rpc.selectedProviderLabel}`}</em>
          </div>
        </section>

        <WalletRailStatus surface="deployment" selectedWalletAddress={activeWallets[0]?.address ?? null} activeMint={activeProject?.tokenMint ?? null} />

        <section className="deploymentAdapterReadiness" aria-label="Deployment adapter status">
          <strong>Deployment disabled in A-profile. Configure and preflight only.</strong>
          <p>Pump.fun, Raydium, Meteora, and Bonk launch paths are visible for planning, but no wallet funding, token deployment, claim, payout, signature request, or broadcast is enabled from this page.</p>
          <div className="deploymentAdapterGrid">
            {['Pump.fun', 'Raydium', 'Meteora', 'Bonk'].map((adapter) => <div key={adapter}><span>{adapter}</span><strong>Disabled</strong><small>configure only · no broadcast</small></div>)}
          </div>
        </section>

        <section className="moduleGrid deploymentGrid" aria-label="Deployment launch paths">
          {launchPaths.map(([title, state, body]) => (
            <article className="moduleCard deploymentCard" key={title}>
              <span>{state}</span><h2>{title}</h2><p>{body}</p>
            </article>
          ))}
        </section>

        {selectedProject && (
          <section className="documentCard selectedProjectBanner">
            <span>Selected project</span>
            <strong>{selectedProject.name}</strong>
            <p>Deployment workspace filtered to this project’s metadata, funding plan, wallet group, and launch blockers.</p>
            <a href={`/projects/${selectedProject.id}`}>Open project cockpit</a>
          </section>
        )}

        <section className="deploymentControlGrid">
          <section className="documentCard launchControlsPanel">
            <div className="sectionIntro compactIntro">
              <span>Controls</span>
              <h2>Launch control board</h2>
              <p>Launch controls expose backend state. Funded actions require live gate, browser-wallet signing, and route-specific preflight.</p>
            </div>
            <div className="controlGroupGrid">
              {launchControlGroups.map(([group, controls]) => (
                <div className="controlGroup" key={group as string}>
                  <strong>{group}</strong>
                  {(controls as string[]).map((control) => <button type="button" disabled key={control}>{control}</button>)}
                </div>
              ))}
            </div>
          </section>

          <section className="documentCard launchQueuePanel">
            <div className="sectionIntro compactIntro"><span>Queue</span><h2>Launch task queue</h2></div>
            <div className="taskQueueList">
              {launchTasks.map(([task, status, owner]) => (
                <div className="taskQueueItem" key={task}>
                  <strong>{task}</strong>
                  <span className={status === 'ready' ? 'profitText' : status === 'blocked' ? 'dangerText' : ''}>{status}</span>
                  <em>{owner}</em>
                </div>
              ))}
            </div>
          </section>
        </section>

        {activeProject ? <LaunchConfigEditor project={activeProject} wallets={activeWallets} /> : <CreateProjectLauncher mode="compact" title="Create Project" label="Create Project" copy="Create a real project before configuring deployment. No token is deployed and no wallet is funded." className="bottomQuickDeployPanel" />}

        <section className="documentCard projectTablePanel">
          <div className="sectionIntro compactIntro">
            <span>Capital</span>
            <h2>Launch capital allocation</h2>
            <p>Visual allocation of each project funding plan. This is planning/accounting only, not fund movement.</p>
          </div>
          <div className="capitalGraphGrid">
            {projects.map((project) => (
              <article className="capitalGraphCard" key={project.id}>
                <h3>{project.name}</h3>
                <AllocationGraph project={project} />
              </article>
            ))}
          </div>
        </section>

        <section className="documentCard launchBundlePanel">
          <div className="sectionIntro compactIntro">
            <span>Launch bundle</span>
            <h2>Multi-wallet launch buy preview</h2>
            <p>Configure launch bundle inputs: selected wallets, live/stored SOL balances, fee/slippage guards, and bundle-sequencer state. Signing/funding requires browser-wallet approval.</p>
          </div>
          <div className="launchBundleGrid">
            {projects.slice(0, 3).map((project) => {
              const wallets = walletsForGroup(project.walletGroupId, store).filter((wallet) => !wallet.archived).slice(0, 5);
              const availableSol = wallets.reduce((sum, wallet, index) => sum + Math.min(wallet.balanceSol, bundleSplit[index] ?? 0.025), 0);
              return (
                <article className="launchBundleCard" key={project.id}>
                  <div className="bundleCardHeader">
                    <span>{project.launchPath}</span>
                    <strong>{project.name}</strong>
                    <small>{wallets.length} wallet(s) · {availableSol.toFixed(3)} SOL available</small>
                  </div>
                  <div className="bundleGuardGrid">
                    <div><span>Mode</span><strong>Bundle sequencer</strong></div>
                    <div><span>Slippage</span><strong>Auto / bps</strong></div>
                    <div><span>Priority</span><strong>Auto fee</strong></div>
                    <div><span>MEV</span><strong>Route-gated</strong></div>
                  </div>
                  <div className="bundleWalletList">
                    {wallets.map((wallet, index) => (
                      <div className="bundleWalletRow" key={wallet.id}>
                        <label><input type="checkbox" checked readOnly /> {wallet.role}</label>
                        <strong>{wallet.address.slice(0, 6)}…{wallet.address.slice(-5)}</strong>
                        <span>{Math.min(wallet.balanceSol, bundleSplit[index] ?? 0.025).toFixed(3)} SOL</span>
                      </div>
                    ))}
                    {wallets.length === 0 && <div className="bundleWalletRow"><strong>No wallets attached</strong><span>Open Portfolio wallets</span></div>}
                  </div>
                  <div className="bundleActionRow">
                    <a href="/api/bundle-sequencer" target="_blank" rel="noreferrer">Open bundle sequencer</a>
                    <a href="/api/deployment-engine" target="_blank" rel="noreferrer">Open deployment engine</a>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="documentCard projectTablePanel">
          <div className="sectionIntro compactIntro">
            <span>Project workspaces</span>
            <h2>Launch object model</h2>
            <p>Each project now carries metadata, launch path, wallet group, funding plan, deployment state, token mint/pool, and monitors.</p>
          </div>
          <div className="projectTable" role="table" aria-label="Deployment workspaces">
            <div className="projectRow deploymentProjectRow projectHead" role="row">
              <span>Project</span><span>Ticker</span><span>Path</span><span>Wallets</span><span>Budget</span><span>Stage</span><span>Ready</span>
            </div>
            {projects.map((project) => {
              const readiness = readinessScore(project, store);
              const wallets = walletsForGroup(project.walletGroupId, store);
              return (
                <div className="projectRow deploymentProjectRow" role="row" key={project.id}>
                  <strong>{project.name}</strong>
                  <span>{project.ticker}</span>
                  <span>{project.launchPath}</span>
                  <span>{wallets.length}</span>
                  <span>{project.fundingPlan.budgetSol.toFixed(2)} SOL</span>
                  <span>{project.deploymentState.stage}</span>
                  <em>{readiness.score}%</em>
                </div>
              );
            })}
          </div>
        </section>

        <section className="documentCard projectTablePanel">
          <div className="sectionIntro compactIntro">
            <span>Preflight</span>
            <h2>Cross-module launch blockers</h2>
            <p>Deployment should not stand alone. These checks route blocked work to Projects, Portfolio wallets, Terminal, Dashboard, or Liquidity.</p>
          </div>
          <div className="projectTable" role="table" aria-label="Cross-module launch blockers">
            <div className="projectRow deploymentPreflightRow projectHead"><span>Project</span><span>Check</span><span>Status</span><span>Owner</span><span>Open</span></div>
            {projects.flatMap((project) => launchPreflight(project, store).filter((check) => check.status !== 'ready').slice(0, 3).map((check) => (
              <div className="projectRow deploymentPreflightRow" key={`${project.id}-${check.label}`}>
                <strong>{project.name}</strong><span>{check.label}</span><span className={check.status === 'blocked' ? 'dangerText' : ''}>{check.status}</span><span>{check.owner}</span><a href={check.href}>Open</a>
              </div>
            )))}
          </div>
        </section>

        <section className="deploymentWorkspaceGrid">
          {projects.map((project) => (
            <article className="documentCard" key={project.id}>
              <div className="sectionIntro compactIntro">
                <span>{project.status}</span>
                <h2>{project.name}</h2>
                <p>{project.deploymentState.disabledReason}</p>
              </div>
              <div className="infoGrid deploymentChecklist">
                <div className="sideRow"><span>Metadata</span><strong>{project.metadata.name} / {project.metadata.symbol}</strong></div>
                <div className="sideRow"><span>Funding</span><strong>Budget {project.fundingPlan.budgetSol} SOL · liquidity {project.fundingPlan.liquiditySol} SOL · fee reserve {project.fundingPlan.feeReserveSol} SOL</strong></div>
                <div className="sideRow"><span>Token mint</span><strong>{project.tokenMint ?? 'Not deployed'}</strong></div>
                <div className="sideRow"><span>Pool</span><strong>{project.pool ?? 'Not created'}</strong></div>
              </div>
            </article>
          ))}
        </section>

        <section className="documentCard postLaunchPanel">
          <div className="sectionIntro compactIntro">
            <span>Post-launch</span>
            <h2>Project monitors</h2>
            <p>Stored monitor rows for positions, orders, holders, top traders, and dev tokens.</p>
          </div>
          <div className="postLaunchMonitorGrid">
            {projects.slice(0, 2).map((project) => (
              <div key={project.id} className="projectMonitorBundle">
                <h3>{project.name}</h3>
                <MonitorTable title="Positions" rows={project.monitor.positions} />
                <MonitorTable title="Orders" rows={project.monitor.orders} />
                <MonitorTable title="Holders" rows={project.monitor.holders} />
                <MonitorTable title="Top traders" rows={project.monitor.topTraders} />
                <MonitorTable title="Dev tokens" rows={project.monitor.devTokens} />
              </div>
            ))}
          </div>
        </section>

        <section className="documentCard guardedPanel">
          <div className="sectionIntro compactIntro">
            <span>Guardrails</span>
            <h2>Features requiring strict controls</h2>
          </div>
          <div className="infoGrid deploymentChecklist">
            {guardedFeatures.map(([label, value]) => <div className="sideRow" key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </section>

        <section className="documentCard projectTablePanel">
          <div className="sectionIntro compactIntro"><span>Logs</span><h2>Deployment event feed</h2></div>
          <div className="projectTable" role="table" aria-label="Deployment event feed">
            <div className="projectRow eventProjectRow projectHead"><span>Project</span><span>Level</span><span>Module</span><span>Message</span></div>
            {projects.flatMap((project) => eventsForProject(project.id, store).map((event) => (
              <div className="projectRow eventProjectRow" key={event.id}><strong>{project.name}</strong><span>{event.level}</span><span>{event.module}</span><em>{event.message}</em></div>
            )))}
          </div>
        </section>
      </div>
    </main>
  );
}
