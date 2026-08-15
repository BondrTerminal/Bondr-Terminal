import { readFileSync } from 'node:fs';
import { buildMeridianHubContext, resolveMeridianProjectContextId } from '../../../../../lib/meridian-context';
import { getMeridianStorePath, type MeridianStore } from '../../../../../lib/meridian-store';
import { buildIpfsMetadataReadiness, pinProjectMetadata } from '../../../../../lib/ipfs-metadata-readiness';
import { getMeridianWalletStore, updateDurableProject, walletStoreMode } from '../../../../../lib/durable-wallet-store';
import { atomicJsonWrite, mutationBlockedResponse, mutationMeta, mutationMode, sameOriginAllowed } from '../../../../../lib/mutation-safety';

export const dynamic = 'force-dynamic';

type Body = {
  projectId?: unknown;
  confirmPin?: unknown;
};

function projectIdFrom(request: Request, body?: Body | null) {
  const { searchParams } = new URL(request.url);
  return (typeof body?.projectId === 'string' ? body.projectId : searchParams.get('project'))?.trim() || null;
}

async function loadProject(projectId: string | null) {
  const store = await getMeridianWalletStore();
  if (projectId && !resolveMeridianProjectContextId(projectId, store)) return { store, active: null, error: 'Unknown Bond.Terminal project or wallet group.' };
  const context = buildMeridianHubContext(projectId, store);
  return { store, active: context.projects[0] ?? null, error: null };
}

export async function GET(request: Request) {
  const observedAt = new Date().toISOString();
  const projectId = projectIdFrom(request);
  const { active, error } = await loadProject(projectId);
  if (error) return Response.json({ status: 'error', observedAt, error, project: projectId }, { status: 404 });
  if (!active) return Response.json({ status: 'blocked', observedAt, blockers: ['project-required'], execution: 'readiness-only-no-ipfs-write' }, { headers: { 'cache-control': 'no-store' } });
  const readiness = buildIpfsMetadataReadiness(active.project);
  return Response.json({
    status: readiness.status,
    observedAt,
    projectId: active.project.id,
    readiness
  }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const observedAt = new Date().toISOString();
  const body = await request.json().catch(() => ({})) as Body;
  const projectId = projectIdFrom(request, body);
  const confirmPin = body.confirmPin === true;
  const { active, error } = await loadProject(projectId);
  if (error) return Response.json({ status: 'error', observedAt, error, project: projectId }, { status: 404 });
  if (!active) return Response.json({ status: 'blocked', observedAt, blockers: ['project-required'], execution: 'readiness-only-no-ipfs-write' }, { headers: { 'cache-control': 'no-store' } });

  const readiness = buildIpfsMetadataReadiness(active.project);
  if (!confirmPin) {
    return Response.json({
      status: readiness.status,
      observedAt,
      projectId: active.project.id,
      readiness,
      note: 'Preview only. Pass confirmPin:true to pin image/metadata and persist metadataUri.',
      execution: 'readiness-only-no-ipfs-write'
    }, { headers: { 'cache-control': 'no-store' } });
  }

  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  if (mutationMode() === 'disabled') return mutationBlockedResponse('Mutations are disabled by MUTATIONS_DISABLED=true.');
  if (readiness.blockers.length) {
    return Response.json({ status: 'blocked', observedAt, projectId: active.project.id, readiness, blockers: readiness.blockers, execution: 'blocked-no-ipfs-write' }, { status: 409 });
  }

  let pinned: Awaited<ReturnType<typeof pinProjectMetadata>>;
  try {
    pinned = await pinProjectMetadata(active.project);
  } catch (error) {
    return Response.json({
      status: 'error',
      observedAt,
      projectId: active.project.id,
      readiness,
      error: error instanceof Error ? error.message : 'IPFS metadata pin failed.',
      execution: 'ipfs-pin-failed-no-launch-no-signing-no-broadcast'
    }, { status: 502, headers: { 'cache-control': 'no-store' } });
  }
  const mode = walletStoreMode();
  if (mode === 'disabled') return mutationBlockedResponse('Mutations are disabled by wallet store mode.');
  const store = mode === 'postgres' ? await getMeridianWalletStore() : JSON.parse(readFileSync(getMeridianStorePath(), 'utf8')) as MeridianStore;
  const index = store.projects.findIndex((project) => project.id === active.project.id);
  if (index < 0) return Response.json({ status: 'error', observedAt, error: 'Project not found.' }, { status: 404 });

  const event = {
    id: `evt-ipfs-${Date.now()}`,
    projectId: active.project.id,
    timestamp: observedAt,
    level: 'info' as const,
    module: 'deployment',
    message: `Token metadata pinned to IPFS: ${pinned.metadataUri}.`
  };
  store.projects[index] = {
    ...store.projects[index],
    metadata: {
      ...store.projects[index].metadata,
      imageUrl: pinned.imageUri,
      metadataUri: pinned.metadataUri
    }
  };
  store.eventLog.unshift(event);

  if (mode === 'postgres') {
    const persisted = await updateDurableProject(store.projects[index], event);
    if (!persisted) return Response.json({ status: 'error', observedAt, error: 'Durable project store is unavailable; IPFS metadata URI was not saved.' }, { status: 503 });
  } else {
    atomicJsonWrite(getMeridianStorePath(), store);
  }

  return Response.json({
    status: 'ok',
    projectId: active.project.id,
    imageUri: pinned.imageUri,
    metadataUri: pinned.metadataUri,
    metadataJson: pinned.metadataJson,
    pinata: pinned.pinata,
    ...mutationMeta('Token image/metadata pinned to IPFS and metadata URI saved to project config.'),
    mutationMode: mode,
    persisted: mode === 'postgres' || mode === 'local-json',
    execution: 'ipfs-pin-only-no-launch-no-signing-no-broadcast'
  });
}
