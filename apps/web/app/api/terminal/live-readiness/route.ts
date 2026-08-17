import { getMeridianWalletStore } from '../../../../lib/durable-wallet-store';
import { meridianAuthConfig, meridianRequestAuthenticated } from '../../../../lib/meridian-auth';
import { walletLiveReadiness } from '../../../../lib/meridian-live-readiness';
import { getSolanaRpcHealth } from '../../../../lib/rpc-health';
import { getLiveActivationStatus } from '../../../../lib/live-activation';

export const dynamic = 'force-dynamic';

function category(status: 'ready' | 'mostly-ready' | 'partial' | 'blocked', score: number, evidence: string[], blockers: string[] = []) {
  return { status, score, evidence: evidence.filter(Boolean), blockers: blockers.filter(Boolean) };
}

export async function GET(request: Request) {
  const observedAt = new Date().toISOString();
  const rpcHealth = await getSolanaRpcHealth();
  const auth = meridianAuthConfig();
  const session = await meridianRequestAuthenticated(request);
  const store = await getMeridianWalletStore();
  const walletReadiness = walletLiveReadiness({ rpc: rpcHealth, wallets: store.wallets });
  const liveActivation = getLiveActivationStatus({ rpcHealth, auth, authenticated: session.authenticated, authReason: session.authenticated ? null : session.reason });

  const categories = {
    walletConnection: category(
      liveActivation.signingEnabled ? 'mostly-ready' : 'partial',
      liveActivation.signingEnabled ? 82 : 62,
      ['Browser-wallet signer path uses Phantom-compatible `window.solana` only.', 'No server custody or private-key collection.'],
      liveActivation.signingEnabled ? [] : ['LIVE_BETA_SIGNING_ENABLED is false or live trading is disabled.']
    ),
    transactionPreview: category(
      'mostly-ready',
      86,
      ['Shared TransactionPreview contract is wired to quote/build/broadcast-adjacent routes.', 'Terminal and Liquidity show human-readable preview safety cards.'],
      ['Deployment-specific unsigned launch adapters still need per-launchpath implementation.']
    ),
    simulation: category(
      liveActivation.requireSimulation ? 'partial' : 'mostly-ready',
      74,
      ['`/api/terminal/signer-dry-run` can decode and simulate posted transaction base64 without signing or broadcasting.'],
      rpcHealth.status === 'live' ? [] : ['RPC must be healthy for reliable simulation.']
    ),
    broadcast: category(
      liveActivation.broadcastEnabled ? 'partial' : 'blocked',
      liveActivation.broadcastEnabled ? 68 : 36,
      ['Broadcast route remains policy-gated and server-signing=false.', `Readiness level: ${liveActivation.readinessLevel}`],
      liveActivation.broadcastEnabled ? ['Needs final unfunded/dev-wallet staging smoke before mainnet use.'] : ['LIVE_BETA_BROADCAST_ENABLED is false or upstream live/signing gates are false.']
    ),
    deployment: category(
      liveActivation.deploymentEnabled ? 'partial' : 'blocked',
      liveActivation.deploymentEnabled ? 58 : 30,
      ['Deployment UI can prepare config/preflight surfaces.', 'Live deployment adapters must be explicit per Pump.fun/Raydium/Meteora/Bonk path.'],
      liveActivation.deploymentEnabled ? ['Adapter-specific unsigned launch builders still required.'] : ['LIVE_DEPLOYMENT_ENABLED is false.']
    ),
    provider: category(
      rpcHealth.status === 'live' ? 'mostly-ready' : 'blocked',
      rpcHealth.status === 'live' ? 82 : 42,
      [`RPC provider: ${rpcHealth.providerLabel ?? rpcHealth.provider}`, `RPC status: ${rpcHealth.status}`],
      rpcHealth.quotaLimited ? ['Configured RPC is quota-limited; add quota or fallback before live beta.'] : rpcHealth.status === 'live' ? [] : [rpcHealth.note ?? rpcHealth.warning ?? 'RPC degraded.']
    ),
    risk: category(
      liveActivation.riskReadiness.status === 'ready' ? 'mostly-ready' : 'blocked',
      liveActivation.riskReadiness.status === 'ready' ? 84 : 34,
      [
        `Max swap: ${liveActivation.limits.maxSolPerSwap} SOL / ${liveActivation.limits.maxUsdcPerSwap} USDC`,
        `Max slippage: ${liveActivation.limits.maxSlippageBps} bps`,
        `Daily loss cap: ${liveActivation.limits.maxDailyLossSol} SOL`,
        `Drawdown kill switch: ${liveActivation.limits.killSwitchDrawdownBps} bps`,
        `HALT active: ${liveActivation.riskReadiness.killSwitch.active}`
      ],
      liveActivation.riskReadiness.blockers
    )
  };

  return Response.json({
    status: 'ok',
    observedAt,
    liveActivation,
    walletReadiness,
    categories,
    summary: {
      readinessLevel: liveActivation.readinessLevel,
      liveTradingEnabled: liveActivation.liveTradingEnabled,
      signingEnabled: liveActivation.signingEnabled,
      broadcastEnabled: liveActivation.broadcastEnabled,
      deploymentEnabled: liveActivation.deploymentEnabled,
      requireSimulation: liveActivation.requireSimulation,
      blockers: liveActivation.blockers,
      warnings: liveActivation.warnings
    }
  });
}
