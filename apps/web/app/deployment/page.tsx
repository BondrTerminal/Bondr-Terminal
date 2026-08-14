import { eventsForProject, launchPreflight, readinessScore, walletsForGroup, type Project, type MeridianStore } from '../../lib/meridian-store';
import { getMeridianWalletStore } from '../../lib/durable-wallet-store';
import { buildMeridianHubContext } from '../../lib/meridian-context';
import { getSolanaRpcHealth } from '../../lib/rpc-health';
import { getLiveActivationStatus } from '../../lib/live-activation';
import { LaunchConfigEditor } from './components/LaunchConfigEditor';
import { CreateProjectLauncher } from '../components/CreateProjectLauncher';
import { WalletRailStatus } from '../components/WalletRailStatus';
import { PreLiveDryRunAction } from '../sniper/components/PreLiveDryRunAction';
import { DeploymentLaunchBuilderPanel } from './components/DeploymentLaunchBuilderPanel';
import { DeploymentReadinessReportAction } from './components/DeploymentReadinessReportAction';

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
  ['Metadata image/socials', 'blocked', 'deployment', 'Token name, symbol, description, image, and socials must be complete before any launch build.'],
  ['Assign funded launch group', 'review', 'wallets', 'Wallets must be routed through Portfolio Wallets with signer/custody clarity.'],
  ['Configure launch bundle', 'review', 'deployment', 'Each participating wallet needs planned buy, max spend, slippage, and risk caps.'],
  ['Snipe/protection plan', 'review', 'sniper', 'Use Terminal route intelligence, signer policy, and wallet caps. Do not self-trade or fake volume.'],
  ['Run launch preflight', 'review', 'deployment', 'Dry-run only; no signatures or broadcasts.'],
  ['Wallet task automation', 'review', 'deployment', 'Timed buys/sells, smart sell, auto take-profit, stop-loss, cooldowns, and wallet-level execution rules.'],
  ['Liquidity Engine review', 'blocked', 'liquidity', 'Launch first, then review pool/liquidity state with read-only data.']
];

const deploymentSections = [
  ['Launch', 'Configure metadata, launch path, mint plan, authority choices, and preflight before any live gate.'],
  ['Bundle', 'Route participating wallets with exact caps, slippage policy, signing order, and no relay submission until implemented.'],
  ['Snipe / protection', 'Prepare monitored buys, stop rules, route checks, and risk constraints without self-trading or misleading activity.'],
  ['Task automation', 'Configure timed buys/sells, smart sell, auto take-profit, stop-loss, cooldowns, and wallet execution rules.']
];

const capabilityMap = [
  ['Launch token', 'real-gated', 'SPL unsigned mint builder exists in deployment engine; live deploy gate is closed.'],
  ['Bundle launch', 'preview', 'Bundle sequencer validates capped multi-wallet legs and can build via swap route, but relay/Jito submission is not implemented.'],
  ['Snipe / protection', 'partial', 'Terminal route, simulate, sign, and swap broadcast are proven; deployment-specific snipe rails need project caps and policy.'],
  ['Task automation', 'partial', 'Wallet task rails model timed buy/sell, smart sell, auto take-profit, stop-loss, sell caps, and cooldowns; live execution remains gated.'],
  ['Anti-abuse policy', 'guarded', 'Task automation must not become wash trading, self-trading, spoofing, or misleading artificial activity.'],
  ['Liquidity setup', 'partial', 'Liquidity Engine can read pools; protocol-specific LP creation builders still need adapter work.'],
  ['Asset upload', 'preview', 'Project asset route exists for metadata/image workflow; launch metadata publishing still needs final rail.'],
  ['Deployment broadcast', 'closed', 'Requires LIVE_DEPLOYMENT_ENABLED and a separate approval ceremony.']
];

const routeMap = [
  ['/deployment', 'Deployment Center', 'active surface'],
  ['/api/deployment-engine', 'Launch snapshot + SPL token unsigned builder', 'real-gated'],
  ['/api/bundle-sequencer', 'Bundle validation and unsigned swap build coordination', 'preview'],
  ['/api/routers/bundle/preflight', 'Bundle preflight proxy', 'preview'],
  ['/api/pre-live-dry-run', 'Read-only deployment dry-run and persisted status', 'real'],
  ['/api/projects/[id]/launch-config', 'Project launch config save/read', 'real'],
  ['/portfolio?view=wallets', 'Wallet Center and custody rails', 'real'],
  ['/sniper', 'Terminal quote/build/simulate/sign/broadcast class', 'proven']
];

function formatAddress(address?: string | null) {
  return address ? `${address.slice(0, 6)}…${address.slice(-5)}` : '—';
}

function statusClass(status: string) {
  if (['ready', 'pass', 'real', 'safe', 'real-gated', 'proven'].includes(status)) return 'profitText';
  if (['blocked', 'fail', 'unsafe', 'closed'].includes(status)) return 'dangerText';
  return '';
}

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
  const activation = getLiveActivationStatus();
  const store: MeridianStore = await getMeridianWalletStore();
  const hubContext = buildMeridianHubContext(params?.project ?? null, store);
  const selectedContext = hubContext.activeProjectId ? hubContext.projects[0] : undefined;
  const selectedProject = selectedContext?.project;
  const projects = selectedProject ? [selectedProject] : hubContext.projects.map((context) => context.project);
  const activeProject = selectedProject ?? projects[0];
  const activeWallets = selectedContext?.wallets ?? (activeProject ? walletsForGroup(activeProject.walletGroupId, store).filter((wallet) => !wallet.archived) : []);
  const activeReadiness = activeProject ? readinessScore(activeProject, store) : null;
  const activePreflight = activeProject ? launchPreflight(activeProject, store) : [];
  const activeConfig = activeProject?.launchConfig;
  const participatingPlan = activeConfig?.walletPlan.filter((entry) => entry.participate) ?? [];
  const plannedBuySol = participatingPlan.reduce((sum, entry) => sum + entry.plannedBuySol, 0);
  const maxBuySol = participatingPlan.reduce((sum, entry) => sum + entry.maxBuySol, 0);

  return (
    <main>
      <div className="contentShell">
        <section className="documentHero oceanHero deploymentHero">
          <div className="eyebrow">Deployment</div>
          <h1>Deployment Center.</h1>
          <p>
            A launch operating surface for project setup, wallet rails, bundle preparation, snipe/protection planning, wallet task automation,
            preflight, signing readiness, and gated deployment execution. Deployment execution, funding, and broadcast remain disabled until a separate approval ceremony.
          </p>
          <div className="launchHeroStatus">
            <span>{activation.deploymentEnabled ? 'Deployment gate open' : 'Deployment gate closed'}</span>
            <strong>{activeProject ? `${activeProject.name} · ${activeProject.ticker}` : 'No project selected'}</strong>
            <em>{activeProject ? `${activeProject.launchPath} · ${activeReadiness?.score ?? 0}% ready` : `Create a project · ${rpc.selectedProviderLabel}`}</em>
          </div>
        </section>

        <WalletRailStatus surface="deployment" selectedWalletAddress={activeWallets[0]?.address ?? null} activeMint={activeProject?.tokenMint ?? null} />

        <section className="deploymentCommandSurface" aria-label="Deployment command surface">
          <div className="deploymentCommandPrimary">
            <div className="sectionIntro compactIntro">
              <span>Operator rail</span>
              <h2>{activeProject ? activeProject.name : 'Create or select a project'}</h2>
              <p>Everything needed to deploy should be visible here: launch path, wallet routing, spend caps, preflight, task state, and disabled reasons.</p>
            </div>
            <div className="deploymentStatusGrid">
              <div><span>Readiness</span><strong>{activeReadiness ? `${activeReadiness.score}%` : '0%'}</strong><small>{activeReadiness ? `${activeReadiness.ready}/${activeReadiness.total} checks` : 'project required'}</small></div>
              <div><span>Wallets railed</span><strong>{activeWallets.length}</strong><small>{participatingPlan.length} participating</small></div>
              <div><span>Planned / max</span><strong>{plannedBuySol.toFixed(3)} / {maxBuySol.toFixed(3)} SOL</strong><small>bundle and snipe caps</small></div>
              <div><span>Gate</span><strong>{activation.deploymentEnabled ? 'Live deploy enabled' : 'Config only'}</strong><small>{activation.deploymentEnabled ? 'requires explicit signing' : 'no deployment broadcast'}</small></div>
            </div>
          </div>
          <div className="deploymentGateStack">
            <div><span>Trading</span><strong>{activation.liveTradingEnabled ? 'on' : 'off'}</strong></div>
            <div><span>Signing</span><strong>{activation.signingEnabled ? 'on' : 'off'}</strong></div>
            <div><span>Swap broadcast</span><strong>{activation.broadcastEnabled ? 'on' : 'off'}</strong></div>
            <div><span>Deployment</span><strong>{activation.deploymentEnabled ? 'on' : 'off'}</strong></div>
          </div>
        </section>

        <section className="deploymentAdapterReadiness" aria-label="Deployment adapter status">
          <strong>Deployment disabled in A-profile. Configure and preflight only.</strong>
          <p>Pump.fun, Raydium, Meteora, and Bonk launch paths are visible for planning, but no wallet funding, token deployment, claim, payout, signature request, or broadcast is enabled from this page.</p>
          <div className="deploymentAdapterGrid">
            {['Pump.fun', 'Raydium', 'Meteora', 'Bonk'].map((adapter) => <div key={adapter}><span>{adapter}</span><strong>Disabled</strong><small>configure only · no broadcast</small></div>)}
          </div>
        </section>

        <section className="deploymentSectionGrid" aria-label="Deployment workflow sections">
          {deploymentSections.map(([title, detail]) => (
            <article key={title} className="deploymentSectionCard">
              <span>{title}</span>
              <p>{detail}</p>
              <strong>{title === 'Launch' ? activeProject?.launchPath ?? 'select path' : title === 'Bundle' ? `${participatingPlan.length} wallet plan(s)` : title === 'Snipe / protection' ? 'policy gated' : 'wallet rules'}</strong>
            </article>
          ))}
        </section>

        <section className="deploymentMapGrid" aria-label="Deployment capability map">
          <section className="documentCard deploymentMapPanel">
            <div className="sectionIntro compactIntro">
              <span>Capability map</span>
              <h2>What is real, gated, partial, or unsafe</h2>
              <p>This is the deployer’s truth table. If a feature is not listed as real, it should not look executable.</p>
            </div>
            <div className="deploymentCapabilityList">
              {capabilityMap.map(([feature, status, detail]) => (
                <div className="deploymentCapabilityRow" key={feature}>
                  <strong>{feature}</strong>
                  <span className={statusClass(status)}>{status}</span>
                  <p>{detail}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="documentCard deploymentMapPanel">
            <div className="sectionIntro compactIntro">
              <span>Routes</span>
              <h2>Rails and backend surfaces</h2>
              <p>Deployment, bundle, snipe, task, wallet, and terminal work should all route through these visible surfaces.</p>
            </div>
            <div className="deploymentRouteList">
              {routeMap.map(([route, purpose, status]) => (
                <div className="deploymentRouteRow" key={route}>
                  <code>{route}</code>
                  <strong>{purpose}</strong>
                  <span className={statusClass(status)}>{status}</span>
                </div>
              ))}
            </div>
          </section>
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
              <span>Visible deployer flow</span>
              <h2>Launch control board</h2>
              <p>These controls are intentionally visible but disabled until their rail is configured and the deployment gate is explicitly opened.</p>
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
            <div className="sectionIntro compactIntro"><span>Queue</span><h2>Launch, bundle, snipe, and task queue</h2></div>
            <div className="taskQueueList">
              {launchTasks.map(([task, status, owner, detail]) => (
                <div className="taskQueueItem" key={task}>
                  <strong>{task}</strong>
                  <span className={statusClass(status)}>{status}</span>
                  <em>{owner}</em>
                  <small>{detail}</small>
                </div>
              ))}
            </div>
          </section>
        </section>

        {activeProject && (
          <section className="documentCard deploymentReadinessLadder">
            <div className="sectionIntro compactIntro">
              <span>Readiness ladder</span>
              <h2>What the deployer must clear</h2>
              <p>Every blocker links back to the surface responsible for fixing it. No deployment action should be hidden behind guesswork.</p>
            </div>
            <div className="deploymentLadderList">
              {activePreflight.map((check, index) => (
                <a className="deploymentLadderRow" href={check.href} key={check.label}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{check.label}</strong>
                  <em className={statusClass(check.status)}>{check.status}</em>
                  <p>{check.detail}</p>
                </a>
              ))}
            </div>
          </section>
        )}

        {activeProject ? <LaunchConfigEditor project={activeProject} wallets={activeWallets} /> : <CreateProjectLauncher mode="compact" title="Create Project" label="Create Project" copy="Create a real project before configuring deployment. No token is deployed and no wallet is funded." className="bottomQuickDeployPanel" />}

        {activeProject && (
          <section className="documentCard deploymentDryRunPanel">
            <div className="sectionIntro compactIntro">
              <span>Dry-run</span>
              <h2>Launch preflight build</h2>
              <p>Validates wallet caps, route config, and risk rules. This does not sign, fund, broadcast, create a token, submit a bundle, or run a snipe.</p>
            </div>
            <div className="deploymentStatusGrid">
              <div><span>Last dry-run</span><strong>{activeProject.preLiveDryRun?.status ?? 'not run'}</strong><small>{activeProject.preLiveDryRun?.observedAt ?? 'run after saving wallet caps'}</small></div>
              <div><span>Participating</span><strong>{activeProject.preLiveDryRun?.participatingWalletCount ?? participatingPlan.length}</strong><small>wallet plan rows</small></div>
              <div><span>Planned SOL</span><strong>{(activeProject.preLiveDryRun?.totalPlannedBuySol ?? plannedBuySol).toFixed(3)}</strong><small>read-only validation</small></div>
              <div><span>Max SOL</span><strong>{(activeProject.preLiveDryRun?.totalMaxBuySol ?? maxBuySol).toFixed(3)}</strong><small>hard cap model</small></div>
            </div>
            <PreLiveDryRunAction projectId={activeProject.id} />
            <DeploymentReadinessReportAction projectId={activeProject.id} />
          </section>
        )}

        {activeProject && <DeploymentLaunchBuilderPanel projectId={activeProject.id} defaultPayer={activeWallets[0]?.address ?? null} deploymentEnabled={activation.deploymentEnabled} />}

        <section className="documentCard deploymentRailsPanel">
          <div className="sectionIntro compactIntro">
            <span>Wallet routing</span>
            <h2>Deployment wallet rails</h2>
            <p>Launch, bundle, snipe, and wallet task automation must all reference the same project wallet set so the deployer can see what each wallet is supposed to do.</p>
          </div>
          <div className="deploymentWalletRailList">
            {activeWallets.length ? activeWallets.map((wallet) => {
              const plan = activeConfig?.walletPlan.find((entry) => entry.walletId === wallet.id);
              return (
                <div className="deploymentWalletRailRow" key={wallet.id}>
                  <strong>{wallet.role}</strong>
                  <code title={wallet.address}>{formatAddress(wallet.address)}</code>
                  <span>{plan?.role ?? 'unassigned'}</span>
                  <span>{plan?.participate ? 'participates' : 'observe'}</span>
                  <span>{(plan?.plannedBuySol ?? 0).toFixed(3)} / {(plan?.maxBuySol ?? 0).toFixed(3)} SOL</span>
                  <span>{wallet.custodyMode ?? 'watch-only'}</span>
                  <a href={`/portfolio?view=wallets&project=${activeProject?.id ?? ''}`}>Wallet Center</a>
                </div>
              );
            }) : <div className="emptyPortfolioState">No active project wallets. Add and rail wallets in Portfolio before launch preparation.</div>}
          </div>
        </section>

        {activeProject && (
          <section className="documentCard deploymentTaskAutomationPanel">
            <div className="sectionIntro compactIntro">
              <span>Wallet tasks</span>
              <h2>Timed buy/sell and smart sell rails</h2>
              <p>Task automation is wallet functionality: timed execution, smart sell, auto take-profit, stop-loss, sell caps, and cooldowns. Live task execution remains gated and must pass policy.</p>
            </div>
            <div className="deploymentTaskAutomationGrid">
              {activeWallets.length ? activeWallets.map((wallet) => {
                const plan = activeConfig?.walletPlan.find((entry) => entry.walletId === wallet.id);
                return (
                  <article className="deploymentTaskAutomationCard" key={wallet.id}>
                    <div>
                      <span>{plan?.participate ? 'active rail' : 'inactive rail'}</span>
                      <strong>{wallet.role}</strong>
                      <code>{formatAddress(wallet.address)}</code>
                    </div>
                    <dl>
                      <div><dt>Task type</dt><dd>{plan?.taskType ?? 'not configured'}</dd></div>
                      <div><dt>Timed buy</dt><dd>{(plan?.taskAmountSol ?? plan?.plannedBuySol ?? 0).toFixed(3)} SOL per run</dd></div>
                      <div><dt>Timed sell</dt><dd>{plan?.taskSellPercent ? `${plan.taskSellPercent}% sell target` : 'not configured'}</dd></div>
                      <div><dt>Smart sell</dt><dd>{plan?.perTxSellCapPct ? `${plan.perTxSellCapPct}% max per sell` : 'not configured'} · {(plan?.taskMaxTotalSol ?? plan?.maxBuySol ?? 0).toFixed(3)} SOL cap</dd></div>
                      <div><dt>Auto TP</dt><dd>{plan?.takeProfitPercents?.length ? `${plan.takeProfitPercents.join(', ')}%` : 'not configured'}</dd></div>
                      <div><dt>Stop / trail</dt><dd>{plan?.stopLossPct ? `${plan.stopLossPct}% stop` : 'no stop'} · {plan?.trailingStopPct ? `${plan.trailingStopPct}% trail` : 'no trail'}</dd></div>
                      <div><dt>Cooldown</dt><dd>{plan?.cooldownSeconds ? `${plan.cooldownSeconds}s` : 'none'}</dd></div>
                    </dl>
                  </article>
                );
              }) : <div className="emptyPortfolioState">Add wallet rails before configuring timed buys, smart sells, or auto take-profit.</div>}
            </div>
          </section>
        )}

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
