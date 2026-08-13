import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { getMeridianStore, getMeridianStorePath, type MeridianStore } from '../../../../../lib/meridian-store';
import { atomicJsonWrite, mutationBlockedResponse, mutationMeta, mutationMode, sameOriginAllowed } from '../../../../../lib/mutation-safety';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const MAX_BYTES = 5 * 1024 * 1024;
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
  if (file.size > MAX_BYTES) return Response.json({ status: 'error', observedAt, error: 'Image too large. Max 5MB.' }, { status: 413 });

  const dataPath = getMeridianStorePath();
  const store = JSON.parse(readFileSync(dataPath, 'utf8')) as MeridianStore;
  const index = store.projects.findIndex((project) => project.id === id);
  if (index < 0) return Response.json({ status: 'error', observedAt, error: 'Project not found.' }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const basename = `${Date.now()}-${safeName(file.name).replace(/\.[^.]+$/, '')}${ext}`;
  const relDir = `/uploads/meridian/${id}`;
  const publicDir = join(process.cwd(), 'public', relDir);
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, basename), bytes);
  const imageUrl = `${relDir}/${basename}`;

  store.projects[index].metadata.imageUrl = imageUrl;
  store.eventLog.unshift({ id: `evt-${Date.now()}`, projectId: id, timestamp: observedAt, level: 'info', module: 'deployment', message: 'Token image uploaded and attached to project metadata.' });
  atomicJsonWrite(dataPath, store);

  return Response.json({ status: 'ok', projectId: id, imageUrl, bytes: file.size, contentType: file.type, ...mutationMeta('Token image uploaded to local public uploads and attached to project metadata.'), execution: 'asset-upload-only-no-signing-no-fund-movement' });
}
