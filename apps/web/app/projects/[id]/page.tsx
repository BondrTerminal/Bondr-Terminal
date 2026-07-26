import { notFound } from 'next/navigation';
import { eventsForProject, formatSol, getMeridianStore, getProject, launchPreflight, projectFlow, readinessScore, walletsForGroup } from '../../../lib/meridian-store';

export const dynamic = 'force-dynamic';

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectCockpitPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const store = getMeridianStore();
  const project = getProject(id, store);
  if (!project) notFound();

  const readiness = readinessScore(project, store);
  const flow = projectFlow(project.id, store);
  const wallets = walletsForGroup(project.walletGroupId, store).filter((wallet) => !wallet.archived);
  const preflight = launchPreflight(project, store);
  const events = eventsForProject(project.id, store);
  const operatingSequence = [
    ['01', 'Project', 'Create the workspace, define identity, and own all module links.'],
    ['02', 'Wallets', 'Attach wallet group, inspect balances, archive retired wallets, and prepare funding.'],
    ['03', 'Deployment', 'Complete metadata, launch path, funding plan, and guarded launch preflight.'],
    ['04', 'Sniper', 'Analyze token/pool context once a mint exists or a contract is pasted.'],
    ['05', 'Dashboard', 'Track net SOL flow from realized buys/sells only.'],
    ['06', 'Liquidity', 'Handoff deployed projects to the backend-wired liquidity engine.']
  ];
  const monitorGroups = [
    ['Positions', project.monitor.positions],
    ['Orders', project.monitor.orders],
    ['Holders', project.monitor.holders],
    ['Top traders', project.monitor.topTraders],
    ['Dev tokens', project.monitor.devTokens]
  ] as const;

  return (
    <main>
      <div className="contentShell">
        <section className="documentHero oceanHero projectCockpitHero">
          <div className="eyebrow">Project Cockpit</div>
          <h1>{project.name}</h1>
          <p>
            Unified command page for this project: launch readiness, wallet group, funding plan,
            token intelligence handoff, accounting, monitors, event history, and Liquidity Engine handoff.
          </p>
        </section>

        <section className="projectCockpitStats" aria-label="Project cockpit summary">
          <div className="projectStat"><span>Status</span><strong>{project.status}</strong><small>{project.launchPath}</small></div>
          <div className="projectStat"><span>Readiness</span><strong>{readiness.score}%</strong><small>{readiness.ready}/{readiness.total} checks</small></div>
          <div className={`projectStat ${flow.netSol >= 0 ? 'positiveFlow' : 'negativeFlow'}`}><span>30d Net SOL</span><strong>{formatSol(flow.netSol)}</strong><small>sells - buys</small></div>
          <div className="projectStat"><span>Wallets</span><strong>{wallets.length}</strong><small>{project.walletGroupId}</small></div>
        </section>

        <section className="projectCockpitGrid">
          <section className="documentCard">
            <div className="sectionIntro compactIntro"><span>Command links</span><h2>Module handoffs</h2></div>
            <div className="projectModuleLinks">
              <a href={project.moduleLinks.deployment}><strong>Deployment</strong><span>metadata, launch path, preflight</span></a>
              <a href={project.moduleLinks.wallets}><strong>Wallet Ops</strong><span>wallet group, balance board, archive</span></a>
              <a href={project.moduleLinks.sniper}><strong>Sniper</strong><span>token intelligence and route context</span></a>
              <a href={project.moduleLinks.dashboard}><strong>Dashboard</strong><span>net SOL accounting</span></a>
              <a href={project.moduleLinks.liquidity}><strong>Liquidity</strong><span>liquidity engine handoff</span></a>
            </div>
          </section>

          <section className="documentCard">
            <div className="sectionIntro compactIntro"><span>Funding</span><h2>Funding plan</h2></div>
            <div className="infoGrid deploymentChecklist">
              <div className="sideRow"><span>Budget</span><strong>{project.fundingPlan.budgetSol.toFixed(2)} SOL</strong></div>
              <div className="sideRow"><span>Liquidity</span><strong>{project.fundingPlan.liquiditySol.toFixed(2)} SOL</strong></div>
              <div className="sideRow"><span>Fee reserve</span><strong>{project.fundingPlan.feeReserveSol.toFixed(2)} SOL</strong></div>
              <div className="sideRow"><span>Dev buy</span><strong>{project.fundingPlan.devBuySol.toFixed(2)} SOL</strong></div>
            </div>
          </section>
        </section>

        <section className="documentCard projectSequencePanel">
          <div className="sectionIntro compactIntro">
            <span>Structure</span>
            <h2>Project operating sequence</h2>
            <p>This is how every project should move through Meridian. Each step has a module owner and a clear job.</p>
          </div>
          <div className="workflowGrid projectSequenceGrid">
            {operatingSequence.map(([index, title, body]) => (
              <article className="workflowStep" key={index}>
                <span>{index}</span>
                <strong>{title}</strong>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="documentCard projectTablePanel">
          <div className="sectionIntro compactIntro">
            <span>Preflight</span>
            <h2>Launch/development readiness</h2>
            <p>This is the competitor-grade bridge: every project tells you what is ready, blocked, and which module owns the fix.</p>
          </div>
          <div className="projectTable" role="table" aria-label="Project preflight checks">
            <div className="projectRow preflightProjectRow projectHead"><span>Check</span><span>Status</span><span>Owner</span><span>Detail</span><span>Open</span></div>
            {preflight.map((check) => (
              <div className="projectRow preflightProjectRow" key={check.label}>
                <strong>{check.label}</strong>
                <span className={check.status === 'ready' ? 'profitText' : check.status === 'blocked' ? 'dangerText' : ''}>{check.status}</span>
                <span>{check.owner}</span>
                <em>{check.detail}</em>
                <a href={check.href}>Open</a>
              </div>
            ))}
          </div>
        </section>

        <section className="projectCockpitGrid">
          <section className="documentCard">
            <div className="sectionIntro compactIntro"><span>Wallets</span><h2>Attached wallet group</h2></div>
            <div className="walletTable" role="table" aria-label="Attached wallet group">
              <div className="walletRow walletHead"><span>Role</span><span>Wallet</span><span>Balance</span><span>Status</span></div>
              {wallets.map((wallet) => (
                <div className="walletRow" key={wallet.id}>
                  <span>{wallet.role}</span><strong>{wallet.address.slice(0, 6)}…{wallet.address.slice(-5)}</strong><span>{wallet.balanceSol.toFixed(2)} SOL</span><em>{wallet.status}</em>
                </div>
              ))}
            </div>
          </section>

          <section className="documentCard">
            <div className="sectionIntro compactIntro"><span>Token</span><h2>Deployment identity</h2></div>
            <div className="infoGrid deploymentChecklist">
              <div className="sideRow"><span>Name</span><strong>{project.metadata.name}</strong></div>
              <div className="sideRow"><span>Ticker</span><strong>{project.ticker}</strong></div>
              <div className="sideRow"><span>Mint</span><strong>{project.tokenMint ?? 'Not deployed'}</strong></div>
              <div className="sideRow"><span>Pool</span><strong>{project.pool ?? 'Not created'}</strong></div>
            </div>
          </section>
        </section>

        <section className="documentCard projectMonitorSummary">
          <div className="sectionIntro compactIntro"><span>Monitor</span><h2>Post-launch/development monitor summary</h2></div>
          <div className="moduleCapabilityGrid">
            {monitorGroups.map(([title, rows]) => (
              <article className="documentCard compactCapability" key={title}>
                <h2>{title}</h2>
                {rows.slice(0, 2).map((row) => <p key={row.label}><strong>{row.label}:</strong> {row.value} · {row.detail}</p>)}
              </article>
            ))}
          </div>
        </section>

        <section className="documentCard projectTablePanel">
          <div className="sectionIntro compactIntro"><span>Audit</span><h2>Project event history</h2></div>
          <div className="projectTable" role="table" aria-label="Project event history">
            <div className="projectRow eventProjectRow projectHead"><span>Project</span><span>Level</span><span>Module</span><span>Message</span></div>
            {events.map((event) => (
              <div className="projectRow eventProjectRow" key={event.id}><strong>{project.name}</strong><span>{event.level}</span><span>{event.module}</span><em>{event.message}</em></div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
