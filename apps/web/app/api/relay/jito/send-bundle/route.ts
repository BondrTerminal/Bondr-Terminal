import { buildJitoSendBundleBlockedResponse, type JitoBundlePayload } from '../../../../../lib/jito-relay-adapter';
import { getLiveActivationStatus } from '../../../../../lib/live-activation';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    status: 'blocked',
    observedAt: new Date().toISOString(),
    blockers: ['post-required', 'signed-bundle-payload-required', 'live-jito-submit-not-implemented'],
    execution: 'blocked-no-jito-relay-submit',
    safety: 'No bundle was submitted. Use POST only after signed payload review exists.'
  }, { status: 405, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as JitoBundlePayload;
  const result = buildJitoSendBundleBlockedResponse(body, getLiveActivationStatus());
  return Response.json(result, { status: 403, headers: { 'cache-control': 'no-store' } });
}
