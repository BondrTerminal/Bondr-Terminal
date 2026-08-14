import { allProjectFlow, eventsForProject, formatSol, projectFlow, projectNextAction, readinessScore } from '../../lib/meridian-store';
import Link from 'next/link';
import { getMeridianWalletStore } from '../../lib/durable-wallet-store';
import { CreateProjectForm } from './components/CreateProjectForm';

export const dynamic = 'force-dynamic';

type ProjectsPageProps = { searchParams?: Promise<{ project?: string }> };

function BalanceGraph({ points }: { points: number[] }) {
  const flowPoints = points.length > 1 ? points : [0, 0];
  const width = 920;
  const height = 260;
  const pad = 30;
  const max = Math.max(...flowPoints, 1);
  const min = Math.min(...flowPoints, -1);
  const x = (index: number) => pad + (index / (flowPoints.length - 1)) * (width - pad * 2);
  const y = (value: number) => pad + ((max - value) / Math.max(1, max - min)) * (height - pad * 2);
  const path = flowPoints.map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(' ');
  return <div className="projectFlowChartWrap bigFlowChart"><svg viewBox={`0 0 ${width} ${height}`} className="projectFlowChart" role="img" aria-label="Total net flow graph"><path className="chartArea" d={`${path} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`} /><path className="chartLine" d={path} />{flowPoints.map((value, index) => <circle key={`${value}-${index}`} cx={x(index)} cy={y(value)} r="4" />)}</svg></div>;
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = await searchParams;
  const store = await getMeridianWalletStore();
  const selectedProject = params?.project ? store.projects.find((project) => project.id === params.project) : undefined;
  const totalFlow = allProjectFlow(store);
  const projects = selectedProject ? [selectedProject] : store.projects;
  const totalBuys = store.flowEvents.filter((event) => event.type === 'buy').reduce((sum, event) => sum + event.solAmount, 0);
  const totalSells = store.flowEvents.filter((event) => event.type === 'sell').reduce((sum, event) => sum + event.solAmount, 0);
  const deployed = store.projects.filter((project) => project.status === 'deployed').length;
  const totalVolume = totalBuys + totalSells;

  return (
    <main className="projectDashboardMain">
      <div className="contentShell projectDashboardShell">
        <section className="documentHero oceanHero projectsHero projectDashboardHeroV2">
          <div className="eyebrow">Projects</div>
          <h1>{selectedProject ? `${selectedProject.name} command view.` : 'Real project command center.'}</h1>
          <p>Track real project records, launch configuration, stored flow events, and routing into Deployment, Terminal, Wallets, and Portfolio. Empty state is intentional until you create a project.</p>
          <div className="projectHeroActions"><Link href="/deployment">Open Launch Prep</Link><Link href="/sniper">Open Terminal</Link><Link href="/portfolio">Open Portfolio</Link></div>
        </section>

        <section className="projectDashboardKpiGrid" aria-label="Project dashboard KPIs">
          <div className={`projectStat heroMetric ${totalFlow.netSol >= 0 ? 'positiveFlow' : 'negativeFlow'}`}><span>Total net flow</span><strong>{formatSol(totalFlow.netSol)}</strong><small>stored buys/sells only</small></div>
          <div className="projectStat heroMetric"><span>Stored net SOL</span><strong>{formatSol(totalFlow.netSol)}</strong><small>from stored flow events</small></div>
          <div className="projectStat heroMetric"><span>Unrealized PnL</span><strong>Provider-limited</strong><small>requires live mark-to-market data</small></div>
          <div className="projectStat heroMetric"><span>Deployed capital</span><strong>{totalBuys.toFixed(2)} SOL</strong><small>stored buy flow</small></div>
          <div className="projectStat heroMetric"><span>Total routed flow</span><strong>{totalVolume.toFixed(2)} SOL</strong><small>buys + sells</small></div>
          <div className="projectStat heroMetric"><span>Projects</span><strong>{store.projects.length}</strong><small>{deployed} deployed</small></div>
        </section>

        <section className="documentCard projectFlowPanel projectDashboardFlowPanel">
          <div className="sectionIntro compactIntro"><span>Net flow</span><h2>Total project cash-flow history</h2><p>Realized buys/sells only. No synthetic prices or seeded project records are shown.</p></div>
          <BalanceGraph points={selectedProject ? projectFlow(selectedProject.id, store).series : totalFlow.series} />
        </section>

        <CreateProjectForm />

        <section className="documentCard projectTablePanel projectHistoryPanel">
          <div className="sectionIntro compactIntro"><span>Projects</span><h2>Stored project records</h2><p>Click any project to inspect it, or route directly into Terminal/Launch Prep/Portfolio.</p></div>
          <div className="projectTable projectDashboardTable" role="table" aria-label="Stored project records">
            <div className="projectRow projectDashboardRow projectHead" role="row"><span>Project</span><span>Status</span><span>Path</span><span>Mint</span><span>Pool</span><span>Stored net SOL</span><span>Flow</span><span>Readiness</span><span>Actions</span></div>
            {projects.length ? projects.map((project) => {
              const flow = projectFlow(project.id, store);
              const readiness = readinessScore(project, store);
              const terminalHref = `/sniper?project=${project.id}${project.tokenMint ? `&mint=${project.tokenMint}` : ''}`;
              return <div className="projectRow projectDashboardRow" role="row" key={project.id}>
                <Link href={`/projects/${project.id}`}><strong>{project.name}</strong><small>{project.ticker}</small></Link>
                <span>{project.status}</span><span>{project.launchPath}</span><span>{project.tokenMint ? `${project.tokenMint.slice(0, 6)}…${project.tokenMint.slice(-5)}` : 'Not launched'}</span><span>{project.pool ? `${project.pool.slice(0, 6)}…${project.pool.slice(-5)}` : 'Not created'}</span>
                <span className={flow.netSol >= 0 ? 'profitText' : 'dangerText'}>{formatSol(flow.netSol)}</span><span>{(flow.buysSol + flow.sellsSol).toFixed(2)} SOL</span><span>{readiness.score}%</span>
                <span className="inlineActionStack"><Link href={`/projects/${project.id}`}>Inspect</Link><Link href={terminalHref}>Terminal</Link><Link href={`/deployment?project=${project.id}`}>Launch Prep</Link><Link href={`/portfolio?project=${project.id}${project.tokenMint ? `&mint=${project.tokenMint}` : ''}`}>Portfolio</Link></span>
              </div>;
            }) : <div className="emptyPortfolioState">No projects yet. Create a project to start configuring launch state.</div>}
          </div>
        </section>

        <section className="projectOpsGrid projectDashboardOpsGrid">
          <section className="documentCard projectActionQueue"><div className="sectionIntro compactIntro"><span>Next actions</span><h2>Operator routing</h2><p>Routes only appear for stored project records.</p></div><div className="linkStack projectActionLinks">{store.projects.length ? store.projects.map((project) => { const action = projectNextAction(project, store); return <Link href={action.href} key={`${project.id}-${action.label}`}><strong>{project.name}</strong><span>{action.label}</span></Link>; }) : <p>No stored project actions yet.</p>}</div></section>
          <section className="documentCard projectCoveragePanel"><div className="sectionIntro compactIntro"><span>Recent history</span><h2>Audit feed</h2><p>Latest stored project events.</p></div><div className="infoGrid deploymentChecklist">{store.projects.flatMap((project) => eventsForProject(project.id, store).slice(0, 1).map((event) => <div className="sideRow" key={event.id}><span>{project.name}</span><strong>{event.module}: {event.message}</strong></div>)).length ? store.projects.flatMap((project) => eventsForProject(project.id, store).slice(0, 1).map((event) => <div className="sideRow" key={event.id}><span>{project.name}</span><strong>{event.module}: {event.message}</strong></div>)) : <p>No project events yet.</p>}</div></section>
        </section>
      </div>
    </main>
  );
}
