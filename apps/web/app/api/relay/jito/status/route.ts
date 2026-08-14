import { getJitoRelayReadiness } from '../../../../../lib/jito-relay-readiness';
import { getLiveActivationStatus } from '../../../../../lib/live-activation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const relay = getJitoRelayReadiness();
  const activation = getLiveActivationStatus();
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    relay,
    gates: {
      liveTradingEnabled: activation.liveTradingEnabled,
      signingEnabled: activation.signingEnabled,
      broadcastEnabled: activation.broadcastEnabled,
      deploymentEnabled: activation.deploymentEnabled,
      relaySubmitEnabled: relay.relayEnabled && activation.broadcastEnabled
    },
    safety: 'Status/readiness only. This endpoint does not build, sign, submit, or relay a transaction bundle.',
    sources: [
      'https://docs.jito.wtf/lowlatencytxnsend/',
      'https://github.com/jito-labs/jito-ts',
      'https://github.com/jito-labs/jito-js-rpc'
    ],
    endpoints: {
      status: '/api/relay/jito/status',
      bundlePreview: '/api/relay/jito/bundle-preview',
      sendBundle: '/api/relay/jito/send-bundle'
    },
    execution: 'jito-relay-status-only-no-submit'
  }, { headers: { 'cache-control': 'no-store' } });
}
