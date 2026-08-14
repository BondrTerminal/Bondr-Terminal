import { buildJitoBundlePreview, type JitoBundlePayload } from '../../../../../lib/jito-relay-adapter';
import { getLiveActivationStatus } from '../../../../../lib/live-activation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const preview = buildJitoBundlePreview({}, getLiveActivationStatus());
  return Response.json({
    status: preview.status,
    observedAt: new Date().toISOString(),
    preview
  }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as JitoBundlePayload;
  const preview = buildJitoBundlePreview(body, getLiveActivationStatus());
  return Response.json({
    status: preview.status,
    observedAt: new Date().toISOString(),
    preview
  }, { headers: { 'cache-control': 'no-store' } });
}
