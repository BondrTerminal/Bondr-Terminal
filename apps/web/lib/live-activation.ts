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
  deploymentEnabled: boolean;
  requireSimulation: boolean;
  allowedCluster: 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet';
  readinessLevel: 'disabled' | 'preview' | 'signing-ready' | 'broadcast-ready' | 'deployment-ready';
  limits: {
    maxSolPerSwap: number;
    maxUsdcPerSwap: number;
    maxSlippageBps: number;
  };
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

export function getLiveActivationStatus(input: { rpcHealth?: MinimalRpcHealth | null; auth?: { configured: boolean } | null; authenticated?: boolean; authReason?: string | null } = {}): LiveActivationStatus {
  const liveTradingEnabled = boolEnv('LIVE_TRADING_ENABLED');
  const signingEnabled = liveTradingEnabled && boolEnv('LIVE_BETA_SIGNING_ENABLED');
  const broadcastEnabled = liveTradingEnabled && signingEnabled && boolEnv('LIVE_BETA_BROADCAST_ENABLED');
  const deploymentEnabled = liveTradingEnabled && signingEnabled && boolEnv('LIVE_DEPLOYMENT_ENABLED');
  const requireSimulation = process.env.LIVE_REQUIRE_SIMULATION !== 'false';
  const allowedCluster = clusterEnv();
  const rpcHealth = input.rpcHealth ?? null;
  const authConfigured = Boolean(input.auth?.configured);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!liveTradingEnabled) blockers.push('LIVE_TRADING_ENABLED is false.');
  if (!boolEnv('LIVE_BETA_SIGNING_ENABLED')) blockers.push('LIVE_BETA_SIGNING_ENABLED is false.');
  if (!boolEnv('LIVE_BETA_BROADCAST_ENABLED')) blockers.push('LIVE_BETA_BROADCAST_ENABLED is false.');
  if (!boolEnv('LIVE_DEPLOYMENT_ENABLED')) warnings.push('LIVE_DEPLOYMENT_ENABLED is false; deployment adapters remain preview-only.');
  if (requireSimulation) warnings.push('LIVE_REQUIRE_SIMULATION is active; failed or missing simulation blocks signing/broadcast.');
  if (rpcHealth?.quotaLimited) blockers.push('Configured RPC is quota-limited; live beta requires a healthy dedicated RPC or approved fallback.');
  if (rpcHealth && rpcHealth.status !== 'live') warnings.push(`RPC health is ${rpcHealth.status}: ${rpcHealth.note ?? rpcHealth.warning ?? 'provider degraded'}`);
  if (allowedCluster !== 'mainnet-beta') warnings.push(`Live cluster is ${allowedCluster}; explorer links and token availability may differ from mainnet.`);
  if (!authConfigured) warnings.push('Meridian auth is not fully configured; operator session checks may block live actions.');

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
    deploymentEnabled,
    requireSimulation,
    allowedCluster,
    readinessLevel,
    limits: {
      maxSolPerSwap: numberEnv('LIVE_MAX_SOL_PER_SWAP', 0.25),
      maxUsdcPerSwap: numberEnv('LIVE_MAX_USDC_PER_SWAP', 50),
      maxSlippageBps: numberEnv('LIVE_MAX_SLIPPAGE_BPS', 250)
    },
    rpcHealth,
    authStatus: input.auth ? { configured: authConfigured, authenticated: input.authenticated, reason: input.authReason ?? null } : null,
    blockers,
    warnings
  };
}
