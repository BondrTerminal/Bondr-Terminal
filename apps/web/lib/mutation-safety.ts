import { renameSync, writeFileSync } from 'node:fs';

export type MutationMode = 'local-json' | 'stateless' | 'disabled' | 'db-required';

export function mutationMode() : MutationMode {
  if (process.env.MUTATIONS_DISABLED === 'true') return 'disabled';
  if (process.env.VERCEL) return 'stateless';
  return 'local-json';
}

export function mutationMeta(note?: string) {
  const mode = mutationMode();
  return {
    observedAt: new Date().toISOString(),
    mutationMode: mode,
    persisted: mode === 'local-json',
    requiresAuth: true,
    authMode: 'local-dev-only',
    note: note ?? (mode === 'local-json' ? 'Local JSON mutation allowed for development; production should use authenticated durable storage.' : 'Mutation did not use durable local JSON persistence.')
  };
}

export function atomicJsonWrite(path: string, data: unknown) {
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmpPath, path);
}

export function sameOriginAllowed(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return { allowed: true, note: 'No Origin header; allowed for local/server tooling.' };
  try {
    const req = new URL(request.url);
    const src = new URL(origin);
    const allowed = src.host === req.host;
    return { allowed, note: allowed ? 'Same-origin mutation request.' : `Cross-origin mutation blocked from ${src.host}.` };
  } catch {
    return { allowed: false, note: 'Invalid Origin header.' };
  }
}

export function mutationBlockedResponse(message: string, status = 403) {
  return Response.json({ status: 'error', error: message, ...mutationMeta(message) }, { status });
}
