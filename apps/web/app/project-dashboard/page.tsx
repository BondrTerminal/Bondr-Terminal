import { allProjectFlow, formatSol, getMeridianStore, getProject, projectFlow } from '../../lib/meridian-store';

export const dynamic = 'force-dynamic';

function BalanceGraph({ points }: { points: number[] }) {
  const flowPoints = points.length > 1 ? points : [0, 0];
  const width = 760;
  const height = 240;
  const pad = 28;
  const max = Math.max(...flowPoints, 1);
  const min = Math.min(...flowPoints, -1);
  const x = (index: number) => pad + (index / (flowPoints.length - 1)) * (width - pad * 2);
  const y = (value: number) => pad + ((max - value) / Math.max(1, max - min)) * (height - pad * 2);
  const path = flowPoints.map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(' ');

  return (
    <div className="projectFlowChartWrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="projectFlowChart" role="img" aria-label="30-day net SOL flow balance graph">
        <path className="chartArea" d={`${path} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`} />
        <path className="chartLine" d={path} />
        {flowPoints.map((value, index) => <circle key={`${value}-${index}`} cx={x(index)} cy={y(value)} r="3" />)}
      </svg>
    </div>
  );
}

type ProjectDashboardProps = { searchParams?: Promise<{ project?: string }> };

export default async function ProjectDashboardPage({ searchParams }: ProjectDashboardProps) {
  const params = await searchParams;
  const store = getMeridianStore();
  const selectedProject = params?.project ? getProject(params.project, store) : undefined;
  const flow = selectedProject ? projectFlow(selectedProject.id, store) : allProjectFlow(store);
  const projects = selectedProject ? [selectedProject] : store.projects;

  return (
    <main>
      <div className="contentShell">
        <section className="documentHero oceanHero projectDashboardHero">
          <div className="eyebrow">Project Dashboard</div>
          <h1>{selectedProject ? `${selectedProject.name} net SOL flow.` : 'Net SOL flow.'}</h1>
          <p>
            Cash-flow accounting for projects. Net SOL flow equals sells minus buys.
            Tokens still held are not valued here, so this is not mark-to-market profit.
          </p>
        </section>

        {selectedProject && (
          <section className="documentCard selectedProjectBanner">
            <span>Selected project</span>
            <strong>{selectedProject.name}</strong>
            <p>Dashboard filtered to this project’s stored flow events.</p>
            <a href={`/projects/${selectedProject.id}`}>Open project cockpit</a>
          </section>
        )}

        <section className="flowKpiGrid" aria-label="Net SOL flow summary">
          <div className={`projectStat ${flow.todayNetSol >= 0 ? 'positiveFlow' : 'negativeFlow'}`}><span>Today</span><strong>{formatSol(flow.todayNetSol)}</strong><small>sells - buys</small></div>
          <div className={`projectStat ${flow.netSol >= 0 ? 'positiveFlow' : 'negativeFlow'}`}><span>Last 30 days</span><strong>{formatSol(flow.netSol)}</strong><small>sells - buys</small></div>
          <div className="projectStat"><span>Total sells</span><strong>{flow.sellsSol.toFixed(2)} SOL</strong><small>cash inflow</small></div>
          <div className="projectStat negativeFlow"><span>Total buys</span><strong>{flow.buysSol.toFixed(2)} SOL</strong><small>cash outflow</small></div>
        </section>

        <section className="documentCard projectFlowPanel">
          <div className="sectionIntro compactIntro">
            <span>Balance graph</span>
            <h2>30-day net SOL flow</h2>
            <p>Running net cash flow from realized buys/sells only. Held token inventory is excluded.</p>
          </div>
          <BalanceGraph points={flow.series} />
        </section>

        <section className="documentCard projectTablePanel">
          <div className="sectionIntro compactIntro">
            <span>Projects</span>
            <h2>{selectedProject ? 'Selected project flow' : 'Flow by project'}</h2>
          </div>
          <div className="projectTable" role="table" aria-label="Project net SOL flow">
            <div className="projectRow flowProjectRow projectHead" role="row">
              <span>Project</span><span>Net flow</span><span>Buys</span><span>Sells</span><span>Window</span>
            </div>
            {projects.map((project) => {
              const projectSummary = projectFlow(project.id, store);
              return (
                <div className="projectRow flowProjectRow" role="row" key={project.id}>
                  <a href={`/projects/${project.id}`}><strong>{project.name}</strong></a>
                  <span className={projectSummary.netSol >= 0 ? 'profitText' : 'dangerText'}>{formatSol(projectSummary.netSol)}</span>
                  <span>{projectSummary.buysSol.toFixed(2)} SOL</span>
                  <span>{projectSummary.sellsSol.toFixed(2)} SOL</span>
                  <em>Last 30 days</em>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
