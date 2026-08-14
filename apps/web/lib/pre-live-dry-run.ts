import type { LaunchConfig, MeridianStore, PreLiveDryRun, Project, Wallet, WalletPlanEntry } from './meridian-store';
import { getLiveActivationStatus } from './live-activation';
import { getJitoRelayReadiness } from './jito-relay-readiness';

export type PreLiveDryRunResult = PreLiveDryRun & {
  contract: 'meridian-pre-live-dry-run-v1';
  projectId: string;
  projectName: string;
  walletGroupId: string;
  participatingWalletIds: string[];
  riskRuleSummary: {
    stopLossPct: number | null;
    takeProfitPercents: number[];
    trailingStopPct: number | null;
    perTxSellCapPct: number | null;
    cooldownSeconds: number | null;
  };
  routeSummary: {
    path: string;
    initialBuySol?: number;
    graduationMonitor?: string;
    raydiumLiquiditySol?: number;
    raydiumWithheldTokenPct?: number;
    raydiumWithheldTokenAmount?: number;
    burnLiquidity?: boolean;
  };
  executionReadiness: {
    relayStatus: string;
    relayEnabled: boolean;
    jitoTipCapSol: number;
    priorityFeeCapSol: number;
    estimatedCreateFeeSol: number;
    requiredBufferSol: number;
    modeledRequiredSol: number;
    missingRiskRules: string[];
    rails: Array<{ phase: string; count: number; status: string; blockers: string[] }>;
  };
  safety: string;
};

function numberOk(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function participantEntries(config: LaunchConfig | undefined, wallets: Wallet[]) {
  const activeIds = new Set(wallets.filter((wallet) => !wallet.archived).map((wallet) => wallet.id));
  return (config?.walletPlan ?? []).filter((entry) => entry.participate && activeIds.has(entry.walletId));
}

function maxValue(entries: WalletPlanEntry[], pick: (entry: WalletPlanEntry) => number) {
  return entries.length ? Math.max(...entries.map(pick)) : 0;
}

function commonRisk(entries: WalletPlanEntry[]) {
  const first = entries[0];
  return {
    stopLossPct: first?.stopLossPct ?? null,
    takeProfitPercents: first?.takeProfitPercents ?? [],
    trailingStopPct: first?.trailingStopPct ?? null,
    perTxSellCapPct: first?.perTxSellCapPct ?? null,
    cooldownSeconds: first?.cooldownSeconds ?? null
  };
}

function missingRiskRules(entries: WalletPlanEntry[]) {
  const missing = new Set<string>();
  for (const entry of entries) {
    if (!numberOk(entry.stopLossPct, -99, -0.000001)) missing.add('stop-loss');
    if (!entry.takeProfitPercents.length) missing.add('take-profit-levels');
    if (!numberOk(entry.perTxSellCapPct, 0.000001, 100)) missing.add('per-tx-sell-cap');
    if (!numberOk(entry.cooldownSeconds, 1, 604800)) missing.add('cooldown');
    if (!numberOk(entry.trailingStopPct, 0.000001, 1000)) missing.add('trailing-stop');
  }
  return Array.from(missing);
}

export function buildPreLiveDryRun(project: Project, store: MeridianStore): PreLiveDryRunResult {
  const observedAt = new Date().toISOString();
  const group = store.walletGroups.find((item) => item.id === project.walletGroupId) ?? null;
  const wallets = store.wallets.filter((wallet) => wallet.groupId === project.walletGroupId && !wallet.archived);
  const config = project.launchConfig;
  const route = config?.route;
  const entries = participantEntries(config, wallets);
  const relay = getJitoRelayReadiness();
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!project.id) blockers.push('project-missing');
  if (!group) blockers.push('wallet-group-missing');
  if (!wallets.length) blockers.push('active-wallets-missing');
  if (!entries.length) blockers.push('participating-wallet-plan-missing');

  const totalPlannedBuySol = entries.reduce((sum, entry) => sum + entry.plannedBuySol, 0);
  const totalMaxBuySol = entries.reduce((sum, entry) => sum + entry.maxBuySol, 0);
  const maxSlippageBps = maxValue(entries, (entry) => entry.maxSlippageBps);

  if (!entries.every((entry) => numberOk(entry.maxBuySol, 0.000001) && numberOk(entry.plannedBuySol, 0) && entry.maxBuySol >= entry.plannedBuySol)) blockers.push('max-spend-caps-missing');
  if (!entries.every((entry) => numberOk(entry.maxSlippageBps, 1, 3000))) blockers.push('slippage-caps-missing');
  const missingRiskRuleList = missingRiskRules(entries);
  if (missingRiskRuleList.length) blockers.push(`risk-rules-missing:${missingRiskRuleList.join(',')}`);
  if ((entries.some((entry) => entry.executionPhase === 'bundle') || route?.buyMode === 'bundle' || route?.buyMode === 'launch-bundle-snipe') && !relay.relayEnabled) blockers.push('jito-relay-disabled');

  if (project.launchPath === 'pump.fun') {
    if (!route || !numberOk(route.initialBuySol, 0)) blockers.push('pumpfun-initial-buy-missing');
    if (!route?.graduationMonitor) warnings.push('pumpfun-graduation-monitor-missing');
  } else if (project.launchPath === 'raydium') {
    if (!route || !numberOk(route.raydiumLiquiditySol, 0.000001)) blockers.push('raydium-liquidity-missing');
    if (!route || !numberOk(route.raydiumWithheldTokenPct, 0, 100)) blockers.push('raydium-withheld-token-policy-missing');
    if (!route?.burnLiquidity) warnings.push('raydium-burn-liquidity-not-enabled');
  } else {
    blockers.push('launch-path-invalid');
  }

  if (process.env.LIVE_DEPLOYMENT_ENABLED === 'true') warnings.push('deployment-gate-enabled-review-before-dry-run');
  if (process.env.LIVE_BETA_BROADCAST_ENABLED === 'true') warnings.push('swap-broadcast-gate-enabled-close-before-deployment-review');
  if (getLiveActivationStatus().fundingBroadcastEnabled) warnings.push('funding-broadcast-gate-enabled-close-before-deployment-review');
  if (totalPlannedBuySol <= 0) warnings.push('total-planned-buy-zero');
  const bundleCount = entries.filter((entry) => entry.executionPhase === 'bundle').length;
  const sniperCount = entries.filter((entry) => entry.executionPhase === 'sniper').length;
  const taskCount = entries.filter((entry) => entry.executionPhase === 'task').length;

  const status: PreLiveDryRunResult['status'] = blockers.length ? 'fail' : warnings.length ? 'warn' : 'pass';
  const routeSummary = project.launchPath === 'raydium'
    ? { path: project.launchPath, raydiumLiquiditySol: route?.raydiumLiquiditySol, raydiumWithheldTokenPct: route?.raydiumWithheldTokenPct, raydiumWithheldTokenAmount: route?.raydiumWithheldTokenAmount, burnLiquidity: route?.burnLiquidity }
    : { path: project.launchPath, initialBuySol: route?.initialBuySol, graduationMonitor: route?.graduationMonitor };

  return {
    contract: 'meridian-pre-live-dry-run-v1',
    projectId: project.id,
    projectName: project.name,
    walletGroupId: project.walletGroupId,
    status,
    observedAt,
    launchPath: project.launchPath,
    participatingWalletCount: entries.length,
    participatingWalletIds: entries.map((entry) => entry.walletId),
    totalPlannedBuySol,
    totalMaxBuySol,
    maxSlippageBps,
    riskRuleSummary: commonRisk(entries),
    routeSummary,
    executionReadiness: {
      relayStatus: relay.status,
      relayEnabled: relay.relayEnabled,
      jitoTipCapSol: relay.tip.maxSol,
      priorityFeeCapSol: config?.devWalletRules.maxPriorityFeeSol ?? 0,
      estimatedCreateFeeSol: Number(process.env.DEPLOYMENT_ESTIMATED_CREATE_FEE_SOL ?? '0.005'),
      requiredBufferSol: Number(process.env.DEPLOYMENT_REQUIRED_BUFFER_SOL ?? '0.01'),
      modeledRequiredSol: totalMaxBuySol + (config?.devWalletRules.maxPriorityFeeSol ?? 0) + relay.tip.maxSol + Number(process.env.DEPLOYMENT_ESTIMATED_CREATE_FEE_SOL ?? '0.005') + Number(process.env.DEPLOYMENT_REQUIRED_BUFFER_SOL ?? '0.01'),
      missingRiskRules: missingRiskRuleList,
      rails: [
        { phase: 'bundle', count: bundleCount, status: bundleCount ? relay.relayEnabled ? 'relay-configured' : 'blocked' : 'not-selected', blockers: bundleCount && !relay.relayEnabled ? ['jito-relay-disabled'] : [] },
        { phase: 'sniper', count: sniperCount, status: sniperCount ? 'readiness-only' : 'not-selected', blockers: sniperCount ? ['sniper-trigger-engine-not-implemented'] : [] },
        { phase: 'task', count: taskCount, status: taskCount ? 'readiness-only' : 'not-selected', blockers: taskCount ? ['durable-task-runner-not-implemented'] : [] }
      ]
    },
    warnings,
    blockers,
    safety: 'Preview only. No signatures, swaps, funding, broadcasts, or launches were built or sent.',
    execution: 'dry-run-only-no-signing-no-broadcast'
  };
}
