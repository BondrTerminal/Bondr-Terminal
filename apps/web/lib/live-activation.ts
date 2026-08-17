import { buildLiveRiskReadiness, type LiveRiskObservation, type LiveRiskReadiness } from './live-risk-readiness';

type MinimalRpcHealth = {
  status?: string;
  provider?: string;
  providerLabel?: string;
  note?: string | null;
  warning?: string | null;
  quotaLimited?: boolean;
};

export type LiveActivationStatus = {
  liveTradingEnabled: boolean;
  signingEnabled: boolean;
  broadcastEnabled: boolean;
  fundingBroadcastEnabled: boolean;
  deploymentEnabled: boolean;
  requireSimulation: boolean;
  allowedCluster: 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet';
  readinessLevel: 'disabled' | 'preview' | 'signing-ready' | 'broadcast-ready' | 'deployment-ready';
  limits: {
    maxSolPerSwap: number;
    maxUsdcPerSwap: number;
    maxSlippageBps: number;
    maxDailyLossSol: number;
    killSwitchDrawdownBps: number;
  };
  riskReadiness: LiveRiskReadiness;
  rpcHealth?: MinimalRpcHealth | null;
  authStatus?: {
    configured: boolean;
    authenticated?: boolean;
    reason?: string | null;
  } | null;
  blockers: string[];
  warnings: string[];
};

function boolEnv(name: string) {
  return process.env[name] === 'true';
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clusterEnv(): LiveActivationStatus['allowedCluster'] {
  const value = process.env.LIVE_ALLOWED_CLUSTER;
  if (value === 'mainnet-beta' || value === 'devnet' || value === 'testnet' || value === 'localnet') return value;
  return 'mainnet-beta';
}

export function getLiveActivationStatus(input: { rpcHealth?: MinimalRpcHealth | null; auth?: { configured: boolean } | null; authenticated?: boolean; authReason?: string | null; riskObservation?: LiveRiskObservation | null; haltActive?: boolean; haltPaths?: string[] } = {}): LiveActivationStatus {
  const liveTradingEnabled = boolEnv('LIVE_TRADING_ENABLED');
  const requireSimulation = process.env.LIVE_REQUIRE_SIMULATION !== 'false';
  const allowedCluster = clusterEnv();
  const rpcHealth = input.rpcHealth ?? null;
  const authConfigured = Boolean(input.auth?.configured);
  const limits = {
    maxSolPerSwap: numberEnv('LIVE_MAX_SOL_PER_SWAP', 0.25),
    maxUsdcPerSwap: numberEnv('LIVE_MAX_USDC_PER_SWAP', 50),
    maxSlippageBps: numberEnv('LIVE_MAX_SLIPPAGE_BPS', 250),
    maxDailyLossSol: numberEnv('LIVE_MAX_DAILY_LOSS_SOL', 0.25),
    killSwitchDrawdownBps: numberEnv('LIVE_KILL_SWITCH_DRAWDOWN_BPS', 500)
  };
  const riskReadiness = buildLiveRiskReadiness({
    limits,
    observation: input.riskObservation,
    liveTradingEnabled,
    haltActive: input.haltActive,
    haltPaths: input.haltPaths
  });
  const riskBlocked = riskReadiness.status === 'blocked';
  const signingEnabled = liveTradingEnabled && boolEnv('LIVE_BETA_SIGNING_ENABLED') && !riskBlocked;
  const broadcastEnabled = liveTradingEnabled && signingEnabled && boolEnv('LIVE_BETA_BROADCAST_ENABLED') && !riskBlocked;
  const fundingBroadcastEnabled = liveTradingEnabled && signingEnabled && boolEnv('LIVE_BETA_FUNDING_BROADCAST_ENABLED') && boolEnv('LIVE_BETA_FUNDING_BROADCAST_ARMED') && !riskBlocked;
  const deploymentEnabled = liveTradingEnabled && signingEnabled && boolEnv('LIVE_DEPLOYMENT_ENABLED') && !riskBlocked;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!liveTradingEnabled) blockers.push('LIVE_TRADING_ENABLED is false.');
  if (!boolEnv('LIVE_BETA_SIGNING_ENABLED')) blockers.push('LIVE_BETA_SIGNING_ENABLED is false.');
  if (!boolEnv('LIVE_BETA_BROADCAST_ENABLED')) blockers.push('LIVE_BETA_BROADCAST_ENABLED is false.');
  if (boolEnv('LIVE_BETA_FUNDING_BROADCAST_ENABLED') && !boolEnv('LIVE_BETA_FUNDING_BROADCAST_ARMED')) warnings.push('LIVE_BETA_FUNDING_BROADCAST_ENABLED is true, but LIVE_BETA_FUNDING_BROADCAST_ARMED is false; funding broadcast is closed.');
  if (!boolEnv('LIVE_DEPLOYMENT_ENABLED')) warnings.push('LIVE_DEPLOYMENT_ENABLED is false; deployment adapters remain preview-only.');
  if (requireSimulation) warnings.push('LIVE_REQUIRE_SIMULATION is active; failed or missing simulation blocks signing/broadcast.');
  if (rpcHealth?.quotaLimited) blockers.push('Configured RPC is quota-limited; live beta requires a healthy dedicated RPC or approved fallback.');
  if (rpcHealth && rpcHealth.status !== 'live') warnings.push(`RPC health is ${rpcHealth.status}: ${rpcHealth.note ?? rpcHealth.warning ?? 'provider degraded'}`);
  if (allowedCluster !== 'mainnet-beta') warnings.push(`Live cluster is ${allowedCluster}; explorer links and token availability may differ from mainnet.`);
  if (!authConfigured) warnings.push('Meridian auth is not fully configured; operator session checks may block live actions.');
  for (const blocker of riskReadiness.blockers) blockers.push(`risk:${blocker}`);
  for (const warning of riskReadiness.warnings) warnings.push(`Risk readiness: ${warning}`);

  const readinessLevel: LiveActivationStatus['readinessLevel'] = deploymentEnabled
    ? 'deployment-ready'
    : broadcastEnabled
      ? 'broadcast-ready'
      : signingEnabled
        ? 'signing-ready'
        : liveTradingEnabled
          ? 'preview'
          : 'disabled';

  return {
    liveTradingEnabled,
    signingEnabled,
    broadcastEnabled,
    fundingBroadcastEnabled,
    deploymentEnabled,
    requireSimulation,
    allowedCluster,
    readinessLevel,
    limits,
    riskReadiness,
    rpcHealth,
    authStatus: input.auth ? { configured: authConfigured, authenticated: input.authenticated, reason: input.authReason ?? null } : null,
    blockers,
    warnings
  };
}
