import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { getMeridianStorePath, type MeridianStore } from '../../../../../lib/meridian-store';
import { getMeridianWalletStore, updateDurableProject, walletStoreMode } from '../../../../../lib/durable-wallet-store';
import { atomicJsonWrite, mutationBlockedResponse, mutationMeta, mutationMode, sameOriginAllowed } from '../../../../../lib/mutation-safety';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const MAX_BYTES = 1.5 * 1024 * 1024;
const ALLOWED = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
]);

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'token-image';
}

export async function POST(request: Request, { params }: Params) {
  const observedAt = new Date().toISOString();
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  if (mutationMode() === 'disabled') return mutationBlockedResponse('Mutations are disabled by MUTATIONS_DISABLED=true.');
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof File)) return Response.json({ status: 'error', observedAt, error: 'Missing image file.' }, { status: 400 });
  const ext = ALLOWED.get(file.type) ?? extname(file.name).toLowerCase();
  if (!ALLOWED.has(file.type) || !ext) return Response.json({ status: 'error', observedAt, error: 'Unsupported image type. Use png, jpg, webp, or gif.' }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ status: 'error', observedAt, error: 'Image too large. Max 1.5MB.' }, { status: 413 });

  const mode = walletStoreMode();
  if (mode === 'disabled') return mutationBlockedResponse('Mutations are disabled by wallet store mode.');
  const store = mode === 'postgres' ? await getMeridianWalletStore() : JSON.parse(readFileSync(getMeridianStorePath(), 'utf8')) as MeridianStore;
  const index = store.projects.findIndex((project) => project.id === id);
  if (index < 0) return Response.json({ status: 'error', observedAt, error: 'Project not found.' }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const version = Date.now();
  const imageUrl = `/api/projects/${encodeURIComponent(id)}/asset-image?v=${version}`;
  const imageDataUrl = `data:${file.type};base64,${bytes.toString('base64')}`;
  const event = { id: `evt-${version}`, projectId: id, timestamp: observedAt, level: 'info' as const, module: 'deployment', message: `Token image ${safeName(file.name)} uploaded and attached to project metadata.` };

  store.projects[index] = {
    ...store.projects[index],
    metadata: {
      ...store.projects[index].metadata,
      imageUrl,
      imageDataUrl,
      imageContentType: file.type,
      imageUpdatedAt: observedAt
    }
  };
  store.eventLog.unshift(event);

  if (mode === 'postgres') {
    const persisted = await updateDurableProject(store.projects[index], event);
    if (!persisted) return Response.json({ status: 'error', observedAt, error: 'Durable project store is unavailable; image was not saved.' }, { status: 503 });
  } else {
    atomicJsonWrite(getMeridianStorePath(), store);
  }

  return Response.json({
    status: 'ok',
    projectId: id,
    imageUrl,
    bytes: file.size,
    contentType: file.type,
    ...mutationMeta('Token image uploaded to durable project metadata and attached to the launch config.'),
    mutationMode: mode,
    persisted: mode === 'postgres' || mode === 'local-json',
    execution: 'asset-upload-only-no-signing-no-fund-movement'
  });
}
