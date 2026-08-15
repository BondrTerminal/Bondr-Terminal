import { eventsForProject, launchPreflight, readinessScore, walletsForGroup, type Project, type MeridianStore } from '../../lib/meridian-store';
import { getMeridianWalletStore } from '../../lib/durable-wallet-store';
import { buildMeridianHubContext } from '../../lib/meridian-context';
import { getSolanaRpcHealth } from '../../lib/rpc-health';
import { getLiveActivationStatus } from '../../lib/live-activation';
import { buildDeploymentLaunchReadiness } from '../../lib/deployment-route-adapters';
import { LaunchConfigEditor } from './components/LaunchConfigEditor';
import { CreateProjectLauncher } from '../components/CreateProjectLauncher';
import { PreLiveDryRunAction } from '../sniper/components/PreLiveDryRunAction';
import { DeploymentLaunchBuilderPanel } from './components/DeploymentLaunchBuilderPanel';
import { DeploymentReadinessReportAction } from './components/DeploymentReadinessReportAction';

export const dynamic = 'force-dynamic';

const capabilityMap = [
  ['launch builder', 'real-gated', 'SPL unsigned mint builder exists; deployment gate is closed.'],
  ['bundle sequencer', 'preview', 'Capped multi-wallet validation exists; Jito policy preview exists and live relay submit remains blocked.'],
  ['snipe / protection', 'partial', 'Terminal execution class is proven; deployment-specific rules remain gated.'],
  ['task automation', 'config-only', 'Timed buys/sells, smart sell, TP/SL, caps, and cooldowns are planning rails.'],
  ['liquidity setup', 'partial', 'Liquidity Engine can inspect pools; LP creation builders need adapter work.'],
  ['deployment broadcast', 'closed', 'Requires LIVE_DEPLOYMENT_ENABLED and explicit approval.'],
  ['launch receipt', 'real', 'Successful launch broadcasts reconcile signature, mint, project status, and monitor seed data.']
];

const routeMap = [
  ['/deployment', 'Deployment cockpit', 'active'],
  ['/api/projects/[id]/launch-config', 'Launch config save/read', 'real'],
  ['/api/pre-live-dry-run', 'Read-only launch dry-run', 'real'],
  ['/api/deployment-readiness', 'Dev-wallet launch readiness + rail checks', 'real'],
  ['/api/deployment-engine', 'Launch snapshot + gated SPL builder', 'real-gated'],
  ['/api/projects/[id]/launch-receipt', 'Post-launch receipt reconciliation', 'real'],
  ['/api/bundle-sequencer', 'Bundle validation/build coordination + Jito relay contract', 'preview'],
  ['/api/relay/jito/bundle-preview', 'Jito signed-bundle policy preview', 'preview'],
  ['/api/relay/jito/send-bundle', 'Blocked Jito sendBundle stub', 'closed'],
  ['/api/sniper/readiness', 'Sniper trigger/submit readiness', 'preview'],
  ['/api/tasks/readiness', 'Task worker/automation readiness', 'preview'],
  ['/portfolio?view=wallets', 'Wallet Center and custody rails', 'real'],
  ['/sniper', 'Terminal quote/build/simulate/sign/broadcast class', 'proven']
];

const launchPathLabels = ['pump.fun', 'raydium'];
const routeAdapters = [
  ['Pump.fun', 'PumpPortal create/trade-local', 'ready', 'IPFS metadata, dev buy, local signing, dry-run first.'],
  ['Raydium', 'Original LP + burn', 'mapped', 'SPL token deploy, Raydium LP add, LP-token burn, simulation first.']
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

function StagePill({ label, status, detail }: { label: string; status: 'ready' | 'review' | 'blocked'; detail: string }) {
  return (
    <div className={`deploymentStagePill ${status}`}>
      <span>{label}</span>
      <strong>{status}</strong>
      <small>{detail}</small>
    </div>
  );
}

function RouteAdapterStrip({ activePath }: { activePath?: string }) {
  return (
    <section className="routeAdapterStrip two" aria-label="Launch route adapters">
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
  const launchReadiness = activeProject ? buildDeploymentLaunchReadiness(activeProject, activeWallets, activation) : null;
  const activeReadiness = activeProject ? readinessScore(activeProject, store) : null;
  const activePreflight = activeProject ? launchPreflight(activeProject, store) : [];
  const activeConfig = activeProject?.launchConfig;
  const launchReceipt = activeProject?.launchReceipt;
  const participatingPlan = activeConfig?.walletPlan.filter((entry) => entry.participate) ?? [];
  const plannedBuySol = participatingPlan.reduce((sum, entry) => sum + entry.plannedBuySol, 0);
  const maxBuySol = participatingPlan.reduce((sum, entry) => sum + entry.maxBuySol, 0);
  const dryRun = activeProject?.preLiveDryRun;
  const eventRows = activeProject ? eventsForProject(activeProject.id, store).slice(0, 6) : [];
  const launchBlockers = launchReadiness?.blockers ?? [];
  const rehearsalBlockers = launchReadiness?.rehearsalBlockers ?? launchBlockers.filter((blocker) => !['deployment-gate-closed', 'broadcast-gate-closed', 'jito-relay-disabled-for-bundle'].includes(blocker));
  const primaryBlocker = rehearsalBlockers[0] ?? activePreflight.find((check) => check.status === 'blocked')?.detail ?? 'Save configuration, run dry-run, then compile shadow plan.';
  const commandVerdict = !activeProject
    ? 'Project required'
    : dryRun?.status === 'pass' && !rehearsalBlockers.length
      ? 'Rehearsal ready'
      : 'Rehearsal blocked';
  const stagePills = activeProject ? [
    { label: 'Token', status: activeProject.metadata.name && activeProject.metadata.symbol && activeProject.metadata.description && activeProject.metadata.imageUrl ? 'ready' as const : 'blocked' as const, detail: activeProject.metadata.symbol || activeProject.ticker },
    { label: 'IPFS', status: launchReadiness?.ipfsMetadataReadiness.status === 'ready' ? 'ready' as const : 'blocked' as const, detail: launchReadiness?.ipfsMetadataReadiness.status ?? 'missing' },
    { label: 'Signer', status: launchReadiness?.signingOrchestration.blockers.length ? 'review' as const : 'ready' as const, detail: launchReadiness?.devWallet?.shortAddress ?? 'wallet missing' },
    { label: 'Shadow', status: 'review' as const, detail: 'compile packet' },
    { label: 'Relay', status: launchReadiness?.relayReadiness.relayEnabled ? 'ready' as const : launchReadiness?.railCounts.bundle ? 'blocked' as const : 'review' as const, detail: launchReadiness?.railCounts.bundle ? launchReadiness?.relayReadiness.status ?? 'Jito disabled' : 'optional for single dev rehearsal' },
    { label: 'Gates', status: activation.deploymentEnabled && activation.broadcastEnabled ? 'ready' as const : 'review' as const, detail: activation.deploymentEnabled && activation.broadcastEnabled ? 'armed' : 'intentionally closed' }
  ] : [];

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
            <div><span>Receipt</span><strong>{launchReceipt?.status ?? 'none'}</strong></div>
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

        <section className="deploymentOpsConsole" aria-label="Launch command center">
          <div className="deploymentOpsVerdict">
            <span>Launch state</span>
            <strong>{commandVerdict}</strong>
            <small>{primaryBlocker}</small>
          </div>
          <div className="deploymentOpsMetrics">
            <div><span>Readiness</span><strong>{activeReadiness ? `${activeReadiness.score}%` : '0%'}</strong><small>{activeReadiness ? `${activeReadiness.ready}/${activeReadiness.total} base checks` : 'project missing'}</small></div>
            <div><span>Dry-run</span><strong>{dryRun?.status ?? 'not run'}</strong><small>{dryRun?.blockers.length ? dryRun.blockers.join(', ') : 'run after save'}</small></div>
            <div><span>Shadow packet</span><strong>available</strong><small>/api/execution/shadow-plan</small></div>
            <div><span>Risk cap</span><strong>{maxBuySol.toFixed(3)} SOL</strong><small>{participatingPlan.length} active wallet(s)</small></div>
          </div>
          <div className="deploymentStageStrip">
            {stagePills.map((item) => <StagePill key={item.label} {...item} />)}
          </div>
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
              <div className="railPanelHeader"><span>Dev launch readiness</span><strong>{launchReadiness?.broadcastReady ? 'armed' : 'blocked'}</strong></div>
              {launchReadiness ? (
                <div className="deploymentApprovalMini">
                  <div><span>Mode</span><strong>{launchReadiness.mode}</strong></div>
                  <div><span>Adapter</span><strong>{launchReadiness.adapterRecommendation}</strong></div>
                  <div><span>Dev wallet</span><strong>{launchReadiness.devWallet?.shortAddress ?? 'missing'}</strong></div>
                  <div><span>Max dev buy</span><strong>{launchReadiness.approvalSummary.maxDevBuySol.toFixed(4)} SOL</strong></div>
                  <div><span>Rails</span><strong>{launchReadiness.railCounts.bundle} bundle · {launchReadiness.railCounts.sniper} sniper · {launchReadiness.railCounts.task} task</strong></div>
                  <div className="wide"><span>Blockers</span><strong>{launchReadiness.blockers.length ? launchReadiness.blockers.join(', ') : 'approval-required'}</strong></div>
                </div>
              ) : <div className="deploymentRailEmpty">Create or select a project to build a launch approval summary.</div>}
            </section>

            <section className="deploymentRailPanel">
              <div className="railPanelHeader"><span>Launch receipt</span><strong>{launchReceipt?.status ?? 'missing'}</strong></div>
              {launchReceipt ? (
                <div className="deploymentApprovalMini">
                  <div><span>Mint</span><strong>{formatAddress(launchReceipt.tokenMint)}</strong></div>
                  <div><span>Signature</span><strong>{formatAddress(launchReceipt.signature)}</strong></div>
                  <div><span>Route</span><strong>{launchReceipt.route}</strong></div>
                  <div><span>Provider</span><strong>{launchReceipt.provider ?? 'unknown'}</strong></div>
                  <div className="wide"><span>Explorer</span><strong><a href={launchReceipt.explorerUrl} target="_blank" rel="noreferrer">Open Solscan</a></strong></div>
                </div>
              ) : <div className="deploymentRailEmpty">No launch receipt recorded for this project yet.</div>}
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
