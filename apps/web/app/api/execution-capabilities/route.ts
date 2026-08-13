import { configuredSolanaRpc } from '../../../lib/solana-rpc';
import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { meridianAuthConfig, meridianRequestAuthenticated } from '../../../lib/meridian-auth';
import { walletLiveReadiness } from '../../../lib/meridian-live-readiness';
import { getSolanaRpcHealth } from '../../../lib/rpc-health';
import { getLiveActivationStatus } from '../../../lib/live-activation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const rpc = configuredSolanaRpc();
  const rpcHealth = await getSolanaRpcHealth();
  const auth = meridianAuthConfig();
  const session = await meridianRequestAuthenticated(request);
  const store = await getMeridianWalletStore();
  const readiness = walletLiveReadiness({ rpc: rpcHealth, wallets: store.wallets });
  const liveActivation = getLiveActivationStatus({
    rpcHealth,
    auth,
    authenticated: session.authenticated,
    authReason: session.authenticated ? null : session.reason
  });

  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    liveTradingEnabled: liveActivation.liveTradingEnabled,
    signingEnabled: liveActivation.signingEnabled,
    broadcastEnabled: liveActivation.broadcastEnabled,
    deploymentEnabled: liveActivation.deploymentEnabled,
    requireSimulation: liveActivation.requireSimulation,
    allowedCluster: liveActivation.allowedCluster,
    readinessLevel: liveActivation.readinessLevel,
    signer: 'browser-wallet',
    swapBuilder: '/api/execution-swap',
    broadcaster: '/api/send-signed-transaction',
    quotePreview: '/api/execution-quote',
    simulation: '/api/terminal/signer-dry-run',
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
