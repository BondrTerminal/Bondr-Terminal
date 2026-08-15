import { configuredSolanaRpc } from '../../../lib/solana-rpc';
import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { meridianAuthConfig, meridianRequestAuthenticated } from '../../../lib/meridian-auth';
import { walletLiveReadiness } from '../../../lib/meridian-live-readiness';
import { getSolanaRpcHealth } from '../../../lib/rpc-health';
import { getLiveActivationStatus } from '../../../lib/live-activation';
import { getJitoRelayReadiness } from '../../../lib/jito-relay-readiness';
import { buildExecutionTruthMap } from '../../../lib/execution-truth-map';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const rpc = configuredSolanaRpc();
  const rpcHealth = await getSolanaRpcHealth();
  const auth = meridianAuthConfig();
  const session = await meridianRequestAuthenticated(request);
  const store = await getMeridianWalletStore();
  const readiness = walletLiveReadiness({ rpc: rpcHealth, wallets: store.wallets });
  const relay = getJitoRelayReadiness();
  const liveActivation = getLiveActivationStatus({
    rpcHealth,
    auth,
    authenticated: session.authenticated,
    authReason: session.authenticated ? null : session.reason
  });
  const truthMap = buildExecutionTruthMap({ store, activation: liveActivation });

  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    liveTradingEnabled: liveActivation.liveTradingEnabled,
    signingEnabled: liveActivation.signingEnabled,
    broadcastEnabled: liveActivation.broadcastEnabled,
    fundingBroadcastEnabled: liveActivation.fundingBroadcastEnabled,
    deploymentEnabled: liveActivation.deploymentEnabled,
    requireSimulation: liveActivation.requireSimulation,
    allowedCluster: liveActivation.allowedCluster,
    readinessLevel: liveActivation.readinessLevel,
    signer: 'browser-wallet',
    swapBuilder: '/api/execution-swap',
    broadcaster: '/api/send-signed-transaction',
    relay,
    relayStatus: relay.status,
    relayProvider: relay.provider,
    relaySubmitEnabled: relay.relayEnabled && liveActivation.broadcastEnabled,
    executionTruthMap: {
      contract: truthMap.contract,
      status: truthMap.status,
      projectId: truthMap.projectId,
      rails: truthMap.rails.map((rail) => ({ rail: rail.rail, status: rail.status, selected: rail.selected, nextAction: rail.nextAction })),
      blockers: truthMap.blockers.slice(0, 12),
      warnings: truthMap.warnings
    },
    quotePreview: '/api/execution-quote',
    simulation: '/api/terminal/signer-dry-run',
    shadowExecutionPlan: '/api/execution/shadow-plan',
    rpcProvider: rpc.provider,
    rpcConfigured: rpc.configured,
    rpcHealth,
    auth: {
      configured: auth.configured,
      authenticated: session.authenticated,
      reason: session.authenticated ? null : session.reason,
      requiredEnv: ['MERIDIAN_SESSION_SECRET', 'MERIDIAN_OPERATOR_KEY']
    },
    limits: liveActivation.limits,
    walletLiveReadiness: readiness,
    liveActivation,
    blockers: liveActivation.blockers,
    warnings: liveActivation.warnings,
    routes: {
      quotePreview: '/api/execution-quote',
      swapBuilder: '/api/execution-swap',
      broadcaster: '/api/send-signed-transaction',
      jitoRelayStatus: '/api/relay/jito/status',
      executionTruthMap: '/api/execution-truth-map',
      shadowExecutionPlan: '/api/execution/shadow-plan',
      simulation: '/api/terminal/signer-dry-run',
      walletOpsEngine: '/api/wallet-ops-engine',
      deploymentEngine: '/api/deployment-engine',
      terminalOrderEngine: '/api/terminal-order-engine',
      bundleSequencer: '/api/bundle-sequencer',
      terminalBackend: '/api/terminal-backend'
    },
    disabledReason: liveActivation.liveTradingEnabled
      ? liveActivation.blockers[0] ?? null
      : 'LIVE_TRADING_ENABLED is false. Quote previews are live; swap signing/broadcast remain blocked.'
  });
}
