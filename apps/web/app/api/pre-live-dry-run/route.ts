import { readFileSync } from 'node:fs';
import { buildPreLiveDryRun } from '../../../lib/pre-live-dry-run';
import { getMeridianStorePath, type MeridianStore, type PreLiveDryRun } from '../../../lib/meridian-store';
import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { atomicJsonWrite, mutationBlockedResponse, mutationMeta, mutationMode, sameOriginAllowed } from '../../../lib/mutation-safety';
import { meridianAuthRequiredResponse } from '../../../lib/meridian-auth';

export const dynamic = 'force-dynamic';

type Body = { project?: unknown };
function clean(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function projectIdFrom(request: Request, body?: Body | null) { const url = new URL(request.url); return clean(body?.project) || clean(url.searchParams.get('project')); }
function safePersistedDryRun(result: ReturnType<typeof buildPreLiveDryRun>): PreLiveDryRun {
  return {
    status: result.status,
    observedAt: result.observedAt,
    launchPath: result.launchPath,
    participatingWalletCount: result.participatingWalletCount,
    totalPlannedBuySol: result.totalPlannedBuySol,
    totalMaxBuySol: result.totalMaxBuySol,
    maxSlippageBps: result.maxSlippageBps,
    warnings: result.warnings,
    blockers: result.blockers,
    execution: result.execution
  };
}

export async function GET(request: Request) {
  const projectId = projectIdFrom(request);
  const store = await getMeridianWalletStore();
  const project = store.projects.find((item) => item.id === projectId) ?? store.projects[0] ?? null;
  if (!project) return Response.json({ status: 'error', error: 'Project not found.', execution: 'dry-run-read-only-no-signing-no-broadcast' }, { status: 404, headers: { 'cache-control': 'no-store' } });
  const preview = buildPreLiveDryRun(project, store);
  return Response.json({ status: 'ok', projectId: project.id, lastDryRun: project.preLiveDryRun ?? null, preview, execution: 'dry-run-read-only-no-signing-no-broadcast' }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const authBlocked = await meridianAuthRequiredResponse(request);
  if (authBlocked) return authBlocked;
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  if (mutationMode() === 'disabled') return mutationBlockedResponse('Mutations are disabled by MUTATIONS_DISABLED=true.');
  const body = await request.json().catch(() => null) as Body | null;
  const projectId = projectIdFrom(request, body);
  const store = JSON.parse(readFileSync(getMeridianStorePath(), 'utf8')) as MeridianStore;
  const index = store.projects.findIndex((project) => project.id === projectId);
  if (index < 0) return Response.json({ status: 'error', error: 'Project not found.', execution: 'dry-run-only-no-signing-no-broadcast' }, { status: 404, headers: { 'cache-control': 'no-store' } });
  const result = buildPreLiveDryRun(store.projects[index], store);
  store.projects[index].preLiveDryRun = safePersistedDryRun(result);
  store.eventLog.unshift({ id: `evt-${Date.now()}`, projectId: store.projects[index].id, timestamp: result.observedAt, level: result.status === 'fail' ? 'error' : result.status === 'warn' ? 'warn' : 'info', module: 'terminal', message: `Pre-live dry-run ${result.status}; no signing, swaps, funding, broadcasts, or launches.` });
  if (mutationMode() === 'local-json') atomicJsonWrite(getMeridianStorePath(), store);
  return Response.json({ status: 'ok', dryRun: result, persistedDryRun: store.projects[index].preLiveDryRun, ...mutationMeta('Pre-live dry-run status persisted only; no transaction or secret material stored.'), execution: 'dry-run-only-no-signing-no-broadcast' }, { headers: { 'cache-control': 'no-store' } });
}
