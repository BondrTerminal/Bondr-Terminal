import { eventsForProject, launchPreflight, readinessScore, walletsForGroup, type Project, type MeridianStore } from '../../lib/meridian-store';
import { getMeridianWalletStore } from '../../lib/durable-wallet-store';
import { buildMeridianHubContext } from '../../lib/meridian-context';
import { getSolanaRpcHealth } from '../../lib/rpc-health';
import { getLiveActivationStatus } from '../../lib/live-activation';
import { LaunchConfigEditor } from './components/LaunchConfigEditor';
import { CreateProjectLauncher } from '../components/CreateProjectLauncher';
import { PreLiveDryRunAction } from '../sniper/components/PreLiveDryRunAction';
import { DeploymentLaunchBuilderPanel } from './components/DeploymentLaunchBuilderPanel';
import { DeploymentReadinessReportAction } from './components/DeploymentReadinessReportAction';

export const dynamic = 'force-dynamic';

const capabilityMap = [
  ['launch builder', 'real-gated', 'SPL unsigned mint builder exists; deployment gate is closed.'],
  ['bundle sequencer', 'preview', 'Capped multi-wallet validation exists; relay/Jito submission is not implemented.'],
  ['snipe / protection', 'partial', 'Terminal execution class is proven; deployment-specific rules remain gated.'],
  ['task automation', 'config-only', 'Timed buys/sells, smart sell, TP/SL, caps, and cooldowns are planning rails.'],
  ['liquidity setup', 'partial', 'Liquidity Engine can inspect pools; LP creation builders need adapter work.'],
  ['deployment broadcast', 'closed', 'Requires LIVE_DEPLOYMENT_ENABLED and explicit approval.']
];

const routeMap = [
  ['/deployment', 'Deployment cockpit', 'active'],
  ['/api/projects/[id]/launch-config', 'Launch config save/read', 'real'],
  ['/api/pre-live-dry-run', 'Read-only launch dry-run', 'real'],
  ['/api/deployment-engine', 'Launch snapshot + gated SPL builder', 'real-gated'],
  ['/api/bundle-sequencer', 'Bundle validation/build coordination', 'preview'],
  ['/portfolio?view=wallets', 'Wallet Center and custody rails', 'real'],
  ['/sniper', 'Terminal quote/build/simulate/sign/broadcast class', 'proven']
];

const launchPathLabels = ['pump.fun', 'raydium', 'meteora', 'bonk'];
const routeAdapters = [
  ['Pump.fun', 'PumpPortal create/trade-local', 'ready', 'IPFS metadata, dev buy, local signing, dry-run first.'],
  ['Bonk', 'LaunchLab candidate', 'research', 'PumpPortal bonk pool or direct LaunchLab adapter; prove in simulation first.'],
  ['Raydium', 'LaunchLab / Trade API', 'mapped', 'Bonding curve launch, graduation tracking, V0 tx build, explicit CU fees.']
];

function formatAddress(address?: string | null) {
  return address ? `${address.slice(0, 6)}…${address.slice(-5)}` : '—';
}

function statusClass(status: string) {
  if (['ready', 'pass', 'real', 'safe', 'real-gated', 'proven', 'active'].includes(status)) return 'profitText';
  if (['blocked', 'fail', 'unsafe', 'closed'].includes(status)) return 'dangerText';
  return '';
}

function GatePill({ label, enabled }: { label: string; enabled: boolean }) {
  return <span className={enabled ? 'deploymentGatePill on' : 'deploymentGatePill'}>{label}: {enabled ? 'on' : 'off'}</span>;
}

function RouteAdapterStrip({ activePath }: { activePath?: string }) {
  return (
    <section className="routeAdapterStrip" aria-label="Launch route adapters">
      {routeAdapters.map(([venue, adapter, status, detail]) => (
        <div className={activePath?.toLowerCase().includes(venue.toLowerCase().split('.')[0] ?? venue.toLowerCase()) ? 'routeAdapterCard active' : 'routeAdapterCard'} key={venue}>
          <span>{venue}</span>
          <strong>{adapter}</strong>
          <em className={statusClass(status)}>{status}</em>
          <small>{detail}</small>
        </div>
      ))}
    </section>
  );
}

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
  const dryRun = activeProject?.preLiveDryRun;
  const eventRows = activeProject ? eventsForProject(activeProject.id, store).slice(0, 6) : [];

  return (
    <main>
      <div className="contentShell deploymentCockpitShell">
        <section className="deploymentCommandBar" aria-label="Deployment command bar">
          <div className="deploymentCommandIdentity">
            <span>Deployment cockpit</span>
            <strong>{activeProject ? `${activeProject.name} · ${activeProject.ticker}` : 'No project selected'}</strong>
            <small>{activeProject ? `${activeProject.launchPath} · ${activeReadiness?.score ?? 0}% ready` : `Create a project · ${rpc.selectedProviderLabel}`}</small>
          </div>
          <div className="deploymentCommandStats">
            <div><span>Wallets</span><strong>{activeWallets.length}</strong></div>
            <div><span>Planned / max</span><strong>{plannedBuySol.toFixed(3)} / {maxBuySol.toFixed(3)} SOL</strong></div>
            <div><span>Dry-run</span><strong>{dryRun?.status ?? 'not run'}</strong></div>
          </div>
          <div className="deploymentCommandGates">
            <GatePill label="signing" enabled={activation.signingEnabled} />
            <GatePill label="swap" enabled={activation.broadcastEnabled} />
            <GatePill label="deploy" enabled={activation.deploymentEnabled} />
          </div>
          <div className="deploymentCommandActions">
            {activeProject && <button className="button primary" type="submit" form="launch-config-form">Save Config</button>}
            {activeProject && <PreLiveDryRunAction projectId={activeProject.id} />}
            {activeProject && <a className="button secondary" href={`/portfolio?view=wallets&project=${activeProject.id}`}>Wallet Center</a>}
          </div>
        </section>

        <section className="deploymentCockpitNotice" aria-label="Deployment safety status">
          <strong>{activation.deploymentEnabled ? 'Deployment gate open' : 'Deployment gate closed'}</strong>
          <p>Configure token info, dev wallet, bundle wallets, sniper wallets, and Task Manager rules here. No token launch, wallet funding, signature request, or deployment broadcast happens while the deployment gate is closed.</p>
        </section>

        <section className="deploymentCockpitGrid" aria-label="Deployment cockpit">
          <div className="deploymentCockpitMain">
            <section className="launchPathStrip" aria-label="Launch paths">
              {launchPathLabels.map((path) => <span className={activeProject?.launchPath === path ? 'active' : ''} key={path}>{path}</span>)}
            </section>
            <RouteAdapterStrip activePath={activeProject?.launchPath} />
            {activeProject
              ? <LaunchConfigEditor project={activeProject} wallets={activeWallets} />
              : <CreateProjectLauncher mode="compact" title="Create Project" label="Create Project" copy="Create a real project before configuring deployment. No token is deployed and no wallet is funded." className="bottomQuickDeployPanel" />}
          </div>

          <aside className="deploymentOperatorRail" aria-label="Deployment operator rail">
            <section className="deploymentRailPanel">
              <div className="railPanelHeader"><span>Readiness</span><strong>{activeReadiness ? `${activeReadiness.score}%` : '0%'}</strong></div>
              <div className="deploymentRailList">
                {activePreflight.map((check, index) => (
                  <a className="deploymentRailRow" href={check.href} key={check.label}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{check.label}</strong>
                    <em className={statusClass(check.status)}>{check.status}</em>
                    <small>{check.detail}</small>
                  </a>
                ))}
                {!activePreflight.length && <div className="deploymentRailEmpty">Create a project to see launch blockers.</div>}
              </div>
            </section>

            <section className="deploymentRailPanel">
              <div className="railPanelHeader"><span>Gates</span><strong>{activation.deploymentEnabled ? 'armed' : 'closed'}</strong></div>
              <div className="deploymentGateMatrix">
                <GatePill label="live trading" enabled={activation.liveTradingEnabled} />
                <GatePill label="signing" enabled={activation.signingEnabled} />
                <GatePill label="swap broadcast" enabled={activation.broadcastEnabled} />
                <GatePill label="funding" enabled={activation.fundingBroadcastEnabled} />
                <GatePill label="deployment" enabled={activation.deploymentEnabled} />
                <span className="deploymentGatePill on">simulation: required</span>
              </div>
            </section>

            <section className="deploymentRailPanel">
              <div className="railPanelHeader"><span>Dry-run summary</span><strong>{dryRun?.status ?? 'not run'}</strong></div>
              <div className="deploymentRailStats">
                <div><span>Participating</span><strong>{dryRun?.participatingWalletCount ?? participatingPlan.length}</strong></div>
                <div><span>Planned SOL</span><strong>{(dryRun?.totalPlannedBuySol ?? plannedBuySol).toFixed(3)}</strong></div>
                <div><span>Max SOL</span><strong>{(dryRun?.totalMaxBuySol ?? maxBuySol).toFixed(3)}</strong></div>
                <div><span>Observed</span><strong>{dryRun?.observedAt ? 'yes' : 'no'}</strong></div>
              </div>
            </section>

            <section className="deploymentRailPanel">
              <div className="railPanelHeader"><span>Wallet plan</span><strong>{activeWallets.length}</strong></div>
              <div className="deploymentWalletRailList compact">
                {activeWallets.length ? activeWallets.map((wallet) => {
                  const plan = activeConfig?.walletPlan.find((entry) => entry.walletId === wallet.id);
                  return (
                    <div className="deploymentWalletRailRow" key={wallet.id}>
                      <strong>{plan?.role ?? wallet.role}</strong>
                      <code title={wallet.address}>{formatAddress(wallet.address)}</code>
                      <span>{plan?.participate ? 'active' : 'observe'}</span>
                      <span>{(plan?.plannedBuySol ?? 0).toFixed(3)} / {(plan?.maxBuySol ?? 0).toFixed(3)} SOL</span>
                    </div>
                  );
                }) : <div className="deploymentRailEmpty">Add wallets in Wallet Center before launch prep.</div>}
              </div>
            </section>
          </aside>
        </section>

        <details className="deploymentAdvancedDetails">
          <summary>Advanced / debug context</summary>
          <section className="deploymentAdvancedGrid">
            <article className="documentCard">
              <div className="sectionIntro compactIntro">
                <span>Backend truth</span>
                <h2>Capability map</h2>
                <p>Operator diagnostics only. Keep this collapsed during normal launch setup.</p>
              </div>
              <div className="deploymentCapabilityList compact">
                {capabilityMap.map(([feature, status, detail]) => (
                  <div className="deploymentCapabilityRow" key={feature}>
                    <strong>{feature}</strong>
                    <span className={statusClass(status)}>{status}</span>
                    <p>{detail}</p>
                  </div>
                ))}
              </div>
              <details className="deploymentRouteDetails">
                <summary>Route map</summary>
                <div className="deploymentRouteList compact">
                  {routeMap.map(([route, purpose, status]) => (
                    <div className="deploymentRouteRow" key={route}>
                      <code>{route}</code>
                      <strong>{purpose}</strong>
                      <span className={statusClass(status)}>{status}</span>
                    </div>
                  ))}
                </div>
              </details>
            </article>
            {activeProject && (
              <article className="documentCard">
                <div className="sectionIntro compactIntro">
                  <span>QA report</span>
                  <h2>Copy deployment report</h2>
                  <p>Collects gates, dry-run, bundle, wallet rail, and deployment engine state.</p>
                </div>
                <DeploymentReadinessReportAction projectId={activeProject.id} />
              </article>
            )}
            {activeProject && <DeploymentLaunchBuilderPanel projectId={activeProject.id} defaultPayer={activeWallets[0]?.address ?? null} deploymentEnabled={activation.deploymentEnabled} />}
            {activeProject && (
              <article className="documentCard">
                <div className="sectionIntro compactIntro">
                  <span>Capital</span>
                  <h2>Launch capital allocation</h2>
                  <p>Planning/accounting only. No fund movement.</p>
                </div>
                <AllocationGraph project={activeProject} />
              </article>
            )}
            {activeProject && (
              <article className="documentCard">
                <div className="sectionIntro compactIntro">
                  <span>Project object</span>
                  <h2>{activeProject.name}</h2>
                  <p>{activeProject.deploymentState.disabledReason}</p>
                </div>
                <div className="infoGrid deploymentChecklist">
                  <div className="sideRow"><span>Metadata</span><strong>{activeProject.metadata.name} / {activeProject.metadata.symbol}</strong></div>
                  <div className="sideRow"><span>Funding</span><strong>Budget {activeProject.fundingPlan.budgetSol} SOL · liquidity {activeProject.fundingPlan.liquiditySol} SOL</strong></div>
                  <div className="sideRow"><span>Token mint</span><strong>{activeProject.tokenMint ?? 'Not deployed'}</strong></div>
                  <div className="sideRow"><span>Pool</span><strong>{activeProject.pool ?? 'Not created'}</strong></div>
                </div>
              </article>
            )}
            <article className="documentCard">
              <div className="sectionIntro compactIntro">
                <span>Event feed</span>
                <h2>Recent deployment activity</h2>
              </div>
              <div className="deploymentEventList">
                {eventRows.length ? eventRows.map((event) => (
                  <div className="deploymentEventRow" key={event.id}>
                    <span className={statusClass(event.level)}>{event.level}</span>
                    <strong>{event.module}</strong>
                    <p>{event.message}</p>
                  </div>
                )) : <div className="deploymentRailEmpty">No deployment events for this project yet.</div>}
              </div>
            </article>
          </section>
        </details>
      </div>
    </main>
  );
}
