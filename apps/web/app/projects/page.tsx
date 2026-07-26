import { allProjectFlow, eventsForProject, formatSol, getMeridianStore, projectFlow, projectNextAction, readinessScore } from '../../lib/meridian-store';
import { CreateProjectForm } from './components/CreateProjectForm';

export const dynamic = 'force-dynamic';

const projectTabs = [
  ['All Projects', 'Complete project index across drafts, pending launches, deployed tokens, and CTO operations.'],
  ['Pending', 'Projects waiting on metadata, wallet setup, funding plan, launch path, or final review.'],
  ['Deployed', 'Launched projects with post-launch charting, holders, liquidity, orders, and dev-token tracking.'],
  ['CTO', 'Community takeover project tracking, ownership notes, relaunch status, and operator tasks.']
];

const moduleCoverage = [
  ['Deployment', 'Metadata, launch path, funding plan, preflight, and post-launch monitor.'],
  ['Wallet Ops', 'Project/global wallets, wallet groups, roles, funding readiness, and wallet-ops engine routes.'],
  ['Sniper Terminal', 'Read-only token lookup, pairs, liquidity, route and risk context.'],
  ['Project Dashboard', 'Today and 30-day net SOL flow; sells minus buys only.'],
  ['Liquidity Engine', 'Autonomous market-maker/scalper cockpit and passive-income focus.']
];

export default function ProjectsPage() {
  const store = getMeridianStore();
  const totalFlow = allProjectFlow(store);
  const pipeline = [
    ['Draft', store.projects.filter((project) => project.status === 'draft').length],
    ['Pending', store.projects.filter((project) => project.status === 'pending').length],
    ['Deployed', store.projects.filter((project) => project.status === 'deployed').length],
    ['CTO', store.projects.filter((project) => project.status === 'cto').length]
  ];
  const maxPipeline = Math.max(...pipeline.map(([, count]) => Number(count)), 1);
  const stats = [
    ['All', String(store.projects.length)],
    ['Pending', String(store.projects.filter((project) => project.status === 'pending').length)],
    ['Deployed', String(store.projects.filter((project) => project.status === 'deployed').length)],
    ['CTO', String(store.projects.filter((project) => project.status === 'cto').length)],
    ['30d Net SOL', formatSol(totalFlow.netSol)]
  ];
  const actionQueue = store.projects.map((project) => ({ project, action: projectNextAction(project, store) }));

  return (
    <main>
      <div className="contentShell">
        <section className="documentHero oceanHero projectsHero">
          <div className="eyebrow">Project Management</div>
          <h1>Launch workspace control.</h1>
          <p>
            Durable project command center across drafts, deployments, CTO operations, wallet groups,
            net SOL flow, launch readiness, event logs, and module handoffs.
          </p>
        </section>

        <section className="projectStatsGrid" aria-label="Project status counts">
          {stats.map(([label, value]) => (
            <div className="projectStat" key={label}>
              <span>{label}</span>
              <strong className={value.startsWith('+') ? 'profitText' : value.startsWith('-') ? 'dangerText' : ''}>{value}</strong>
            </div>
          ))}
        </section>

        <section className="projectTabGrid" aria-label="Project tabs">
          {projectTabs.map(([title, body]) => (
            <article className="documentCard projectTabCard" key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </article>
          ))}
        </section>

        <CreateProjectForm />

        <section className="projectOrganizationGrid">
          <section className="documentCard pipelineGraphPanel">
            <div className="sectionIntro compactIntro">
              <span>Organization</span>
              <h2>Project pipeline graph</h2>
              <p>Quick visual view of where projects sit across draft, pending, deployed, and CTO workflows.</p>
            </div>
            <div className="pipelineGraph">
              {pipeline.map(([label, count]) => (
                <div className="pipelineBar" key={label as string}>
                  <span>{label}</span>
                  <div><i style={{ height: `${(Number(count) / maxPipeline) * 100}%` }} /></div>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="documentCard projectControlPanel">
            <div className="sectionIntro compactIntro">
              <span>Controls</span>
              <h2>Project control center</h2>
              <p>Organization controls for filtering, reviewing, archiving, and handoff. Mutating actions remain disabled.</p>
            </div>
            <div className="projectControlGrid">
              <button type="button" disabled>Filter by status</button>
              <button type="button" disabled>Sort by readiness</button>
              <button type="button" disabled>Open selected cockpit</button>
              <button type="button" disabled>Archive project</button>
              <button type="button" disabled>Export project list</button>
              <button type="button" disabled>Assign owner</button>
            </div>
          </section>
        </section>

        <section className="documentCard projectReadinessPanel">
          <div className="sectionIntro compactIntro">
            <span>Readiness</span>
            <h2>Launch readiness matrix</h2>
            <p>Computed from stored metadata, wallet groups, funding plan, launch path, deployment state, and monitor coverage.</p>
          </div>
          <div className="infoGrid deploymentChecklist">
            {store.projects.map((project) => {
              const readiness = readinessScore(project, store);
              return (
                <div className="sideRow" key={project.id}>
                  <span><a href={`/projects/${project.id}`}>{project.name}</a></span>
                  <strong>{readiness.score}% ready — {readiness.missing.length ? `Missing: ${readiness.missing.join(', ')}` : 'Ready for review'}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="projectOpsGrid">
          <section className="documentCard projectActionQueue">
            <div className="sectionIntro compactIntro">
              <span>Operator queue</span>
              <h2>Next actions</h2>
              <p>Quick-action workflow. Links move the operator to the module that owns the missing work.</p>
            </div>
            <div className="linkStack projectActionLinks">
              {actionQueue.map(({ project, action }) => (
                <a href={action.href} key={`${project.id}-${action.label}`}>
                  <strong>{project.name}</strong>
                  <span>{action.label}</span>
                </a>
              ))}
            </div>
          </section>

          <section className="documentCard projectCoveragePanel">
            <div className="sectionIntro compactIntro">
              <span>Coverage</span>
              <h2>Module coverage</h2>
              <p>What each project can attach to as the Meridian hub matures.</p>
            </div>
            <div className="infoGrid deploymentChecklist">
              {moduleCoverage.map(([label, value]) => (
                <div className="sideRow" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>
        </section>

        <section className="documentCard projectTablePanel">
          <div className="sectionIntro compactIntro">
            <span>Projects</span>
            <h2>Project index</h2>
            <p>Data-driven project list from local Meridian storage. Net SOL = sells - buys; held tokens are excluded.</p>
          </div>
          <div className="projectTable" role="table" aria-label="Project index">
            <div className="projectRow managementProjectRow projectHead" role="row">
              <span>Project</span><span>Status</span><span>Path</span><span>Readiness</span><span>Net SOL</span><span>Net- buys</span><span>Net+ sells</span><span>Next step</span>
            </div>
            {store.projects.map((project) => {
              const flow = projectFlow(project.id, store);
              const readiness = readinessScore(project, store);
              const action = projectNextAction(project, store);
              return (
                <div className="projectRow managementProjectRow" role="row" key={project.id}>
                  <a href={`/projects/${project.id}`}><strong>{project.name}</strong></a>
                  <span>{project.status}</span>
                  <span>{project.launchPath}</span>
                  <span>{readiness.score}%</span>
                  <span className={flow.netSol > 0 ? 'profitText' : flow.netSol < 0 ? 'dangerText' : ''}>{formatSol(flow.netSol)}</span>
                  <span>{flow.buysSol.toFixed(2)} SOL</span>
                  <span>{flow.sellsSol.toFixed(2)} SOL</span>
                  <a href={action.href}>{action.label}</a>
                </div>
              );
            })}
          </div>
        </section>

        <section className="documentCard projectTablePanel">
          <div className="sectionIntro compactIntro">
            <span>Execution logs</span>
            <h2>Project event history</h2>
            <p>Competitor-grade terminals expose live logs. This is the first durable project-level audit feed.</p>
          </div>
          <div className="projectTable" role="table" aria-label="Project event history">
            <div className="projectRow eventProjectRow projectHead" role="row">
              <span>Project</span><span>Level</span><span>Module</span><span>Message</span>
            </div>
            {store.projects.flatMap((project) => eventsForProject(project.id, store).slice(0, 2).map((event) => (
              <div className="projectRow eventProjectRow" role="row" key={event.id}>
                <strong>{project.name}</strong>
                <span className={event.level === 'warn' ? 'dangerText' : 'profitText'}>{event.level}</span>
                <span>{event.module}</span>
                <em>{event.message}</em>
              </div>
            )))}
          </div>
        </section>
      </div>
    </main>
  );
}
