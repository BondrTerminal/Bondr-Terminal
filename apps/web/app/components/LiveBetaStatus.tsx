import { meridianAuthConfig, meridianSessionStatus } from '../../lib/meridian-auth';
import { getLiveActivationStatus } from '../../lib/live-activation';
import { getSolanaRpcHealth } from '../../lib/rpc-health';

type LiveBetaStatusProps = {
  surface?: 'hub' | 'terminal' | 'liquidity' | 'deployment' | 'wallets' | 'profile';
  compact?: boolean;
};

function yesNo(value: boolean) {
  return value ? 'Enabled' : 'Disabled';
}

function statusClass(value: boolean) {
  return value ? 'liveBetaGood' : 'liveBetaOff';
}

export async function LiveBetaStatus({ surface = 'hub', compact = false }: LiveBetaStatusProps) {
  const rpcHealth = await getSolanaRpcHealth();
  const auth = meridianAuthConfig();
  const session = await meridianSessionStatus();
  const live = getLiveActivationStatus({
    rpcHealth,
    auth,
    authenticated: session.authenticated,
    authReason: session.authenticated ? null : session.reason
  });
  const providerLimited = Boolean(rpcHealth.quotaLimited || rpcHealth.status !== 'live');
  const providerLabel = rpcHealth.selectedProviderLabel ?? rpcHealth.providerLabel ?? rpcHealth.provider ?? 'Configured RPC';
  const title = surface === 'terminal'
    ? 'Terminal signing readiness'
    : surface === 'deployment'
      ? 'Deployment live-beta gates'
      : surface === 'wallets'
        ? 'Wallet Ops live-beta gates'
        : surface === 'liquidity'
          ? 'Liquidity execution gates'
          : 'Live Beta Status';

  return (
    <section className={`liveBetaStatusCard ${compact ? 'compactLiveBetaStatus' : ''}`} aria-label={`${title} status`}>
      <div className="liveBetaStatusHeader">
        <div>
          <span>A-profile</span>
          <strong>{title}</strong>
          <small>{live.readinessLevel} · {live.allowedCluster} · browser-wallet only</small>
        </div>
        <em className={live.signingEnabled ? 'liveBetaReadyPill' : 'liveBetaBlockedPill'}>{live.signingEnabled ? 'Signing ready' : 'Signing blocked'}</em>
      </div>
      <div className="liveBetaStatusGrid">
        <div className={statusClass(live.liveTradingEnabled)}><span>Live trading</span><strong>{yesNo(live.liveTradingEnabled)}</strong></div>
        <div className={statusClass(live.signingEnabled)}><span>Browser-wallet signing</span><strong>{yesNo(live.signingEnabled)}</strong></div>
        <div className={statusClass(live.requireSimulation)}><span>Simulation required</span><strong>{yesNo(live.requireSimulation)}</strong></div>
        <div className={statusClass(live.broadcastEnabled)}><span>Broadcast</span><strong>{yesNo(live.broadcastEnabled)}</strong></div>
        <div className={statusClass(live.deploymentEnabled)}><span>Deployment</span><strong>{yesNo(live.deploymentEnabled)}</strong></div>
        <div className="liveBetaOff"><span>Funding / payouts</span><strong>Disabled</strong></div>
        <div><span>Max SOL swap</span><strong>{live.limits.maxSolPerSwap}</strong></div>
        <div><span>Max USDC swap</span><strong>{live.limits.maxUsdcPerSwap}</strong></div>
        <div><span>Max slippage</span><strong>{live.limits.maxSlippageBps} bps</strong></div>
        <div className={providerLimited ? 'liveBetaWarn' : 'liveBetaGood'}><span>Provider</span><strong>{providerLabel}</strong><small>{providerLimited ? 'provider-limited until RPC plan upgrade/reset' : 'healthy'}</small></div>
        <div className={session.authenticated ? 'liveBetaGood' : 'liveBetaWarn'}><span>Operator auth</span><strong>{session.authenticated ? 'Authenticated' : 'Required'}</strong><small>{session.authenticated ? 'session active' : session.reason ?? 'login before signing test'}</small></div>
      </div>
      <p className="liveBetaStatusNote">
        A-profile lets operators test quote → unsigned build → simulation → browser-wallet signing. Broadcast, deployment, wallet funding, reward claims, and payouts stay off until a separate B/C-profile approval.
        {providerLimited ? ' Provider-limited: simulation may fail until the Helius/RPC plan is upgraded or resets.' : ''}
      </p>
    </section>
  );
}
