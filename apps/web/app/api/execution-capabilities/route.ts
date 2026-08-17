import { configuredSolanaRpc } from '../../../lib/solana-rpc';
import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { meridianAuthConfig, meridianRequestAuthenticated } from '../../../lib/meridian-auth';
import { walletLiveReadiness } from '../../../lib/meridian-live-readiness';
import { getSolanaRpcHealth } from '../../../lib/rpc-health';
import { getLiveActivationStatus } from '../../../lib/live-activation';
import { getJitoRelayReadiness } from '../../../lib/jito-relay-readiness';
import { buildExecutionTruthMap } from '../../../lib/execution-truth-map';
import { buildSingleBroadcastRollbackRunbook } from '../../../lib/live-rollback-runbook';

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
  const singleBroadcastRollback = buildSingleBroadcastRollbackRunbook();
  const packedWalletEnv = Number(process.env.JITO_MAX_WALLETS_PER_PACKED_TRANSACTION);
  const maxPackedWalletsPerTransaction = Math.max(1, Math.min(Number.isFinite(packedWalletEnv) ? packedWalletEnv : 4, 6));

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
    jitoPackedExecutionModel: {
      contract: 'bondr-jito-packed-execution-plan-v1',
      maxTransactionsPerJitoBundle: relay.limits.maxTransactionsPerBundle,
      maxPackedWalletsPerTransaction,
      overflowMode: 'near-synchronous-jito-waves',
      atomicity: {
        withinJitoBundle: true,
        acrossWaves: false
      },
      requiredProofs: ['address-lookup-table-proof-for-packed-wallets', 'simulation-proof-per-packed-transaction', 'signed-review-per-packed-transaction', 'bundle-status-receipt-per-wave', 'chain-state-proof-after-landing'],
      flow: ['packed transaction build', 'packed transaction proof', 'multi-wallet signature collection', 'wave dispatch approval plan', 'bundle status receipt', 'chain effect proof'],
      safety: {
        noServerCustody: true,
        relaySubmitRequiresBroadcastGate: true
      }
    },
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
    riskReadiness: liveActivation.riskReadiness,
    walletLiveReadiness: readiness,
    liveActivation,
    singleBroadcastRollback,
    blockers: liveActivation.blockers,
    warnings: liveActivation.warnings,
    routes: {
      quotePreview: '/api/execution-quote',
      authenticatedQaChecklist: '/api/authenticated-qa-checklist',
      swapBuilder: '/api/execution-swap',
      broadcaster: '/api/send-signed-transaction',
      jitoRelayStatus: '/api/relay/jito/status',
      jitoAddressLookupTablePlan: '/api/relay/jito/address-lookup-table-plan',
      jitoPackedTransactionBuild: '/api/relay/jito/packed-transaction-build',
      jitoPackedTransactionProof: '/api/relay/jito/packed-transaction-proof',
      jitoMultiWalletSigningSession: '/api/relay/jito/multi-wallet-signing-session',
      jitoWaveDispatchPlan: '/api/relay/jito/wave-dispatch-plan',
      jitoChainEffectProof: '/api/relay/jito/chain-effect-proof',
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
