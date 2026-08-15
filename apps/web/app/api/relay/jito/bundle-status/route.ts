import { getJitoBundleStatus, type BundleReceiptRecord } from '../../../../../lib/jito-relay-adapter';

export const dynamic = 'force-dynamic';

type Body = {
  bundleId?: unknown;
  bundleIds?: unknown;
  projectId?: unknown;
  rail?: unknown;
};

function rail(value: unknown): BundleReceiptRecord['rail'] {
  return value === 'deployment' || value === 'bundle' || value === 'sniper' || value === 'task' ? value : 'bundle';
}

function inputFrom(request: Request, body?: Body | null) {
  const { searchParams } = new URL(request.url);
  const queryIds = searchParams.get('bundleIds') ?? searchParams.get('bundleId');
  return {
    bundleIds: body?.bundleIds ?? body?.bundleId ?? (queryIds ? queryIds.split(',').map((item) => item.trim()).filter(Boolean) : []),
    projectId: (typeof body?.projectId === 'string' ? body.projectId : searchParams.get('project'))?.trim() || null,
    rail: rail(body?.rail ?? searchParams.get('rail'))
  };
}

export async function GET(request: Request) {
  const result = await getJitoBundleStatus(inputFrom(request));
  return Response.json(result, { status: result.status === 'blocked' ? 409 : result.status === 'relay-error' ? 502 : 200, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Body;
  const result = await getJitoBundleStatus(inputFrom(request, body));
  return Response.json(result, { status: result.status === 'blocked' ? 409 : result.status === 'relay-error' ? 502 : 200, headers: { 'cache-control': 'no-store' } });
}
