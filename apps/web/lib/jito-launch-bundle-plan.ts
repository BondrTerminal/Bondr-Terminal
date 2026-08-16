import { createHash } from 'node:crypto';
import type { LiveActivationStatus } from './live-activation';
import type { JitoRelayReadiness } from './jito-relay-readiness';
import { getJitoRelayReadiness } from './jito-relay-readiness';
import { walletPlanEntries, type Project, type Wallet, type WalletPlanEntry } from './meridian-store';
import { buildWalletSigningReadiness, type WalletSigningSessionInput } from './wallet-signing-readiness';

type Rail = 'deployment' | 'bundle' | 'sniper' | 'task' | 'tip';

export type JitoLaunchBundlePlanLeg = {
  id: string;
  rail: Rail;
  label: string;
  required: boolean;
  walletId: string | null;
  signer: string | null;
  side: 'create' | 'buy' | 'sell' | 'tip' | 'observe';
  maxSol: number;
  slippageBps: number | null;
  priorityFeeSol: number | null;
  status: 'planned' | 'blocked';
  blockers: string[];
};

export type JitoPreparedLaunchTransaction = {
  id: string;
  transactionBase64: string;
  expectedSigners: string[];
  messageHash: string | null;
  simulationPolicyStatus: 'passed' | 'blocked' | string;
};

export type JitoLaunchBundlePlan = {
  contract: 'bondr-jito-launch-bundle-plan-v1';
  status: 'preflight-ready' | 'blocked';
  execution: 'launch-bundle-plan-only-no-signing-no-relay-submit';
  projectId: string | null;
  expectedMint: string | null;
  bundleHash: string;
  legHashes: Array<{ id: string; hash: string }>;
  legs: JitoLaunchBundlePlanLeg[];
  preparedTransactions: {
    count: number;
    ids: string[];
    messageHashes: string[];
    allSimulationPoliciesPassed: boolean;
    blockers: string[];
  };
  signingOrder: string[];
  signingSession: ReturnType<typeof buildWalletSigningReadiness>['bundleSession'];
  policy: {
    maxTransactions: number;
    plannedTransactions: number;
    maxTotalSol: number;
    plannedMaxSol: number;
    maxSlippageBps: number | null;
    maxPriorityFeeSol: number | null;
    tipLamports: number;
    maxTipLamports: number;
    simulationRequired: true;
    explicitApprovalRequired: true;
  };
  relay: {
    status: JitoRelayReadiness['status'];
    relayEnabled: boolean;
    provider: JitoRelayReadiness['provider'];
  };
  antiAbuse: {
    noSelfTradeLoop: true;
    noWashTrading: true;
    noFakeVolume: true;
    controlledWalletSellLegsBlocked: boolean;
  };
  blockers: string[];
  warnings: string[];
  safety: {
    noSigning: true;
    noBroadcast: true;
    noRelaySubmit: true;
    noServerCustody: true;
  };
};

function phaseFor(entry: WalletPlanEntry): NonNullable<WalletPlanEntry['executionPhase']> {
  if (entry.executionPhase) return entry.executionPhase;
  const role = entry.role.toLowerCase();
  if (role.includes('dev') || role.includes('creator')) return 'dev';
  if (role.includes('bundle')) return 'bundle';
  if (role.includes('sniper')) return 'sniper';
  if (role.includes('task')) return 'task';
  return 'observe';
}

function planWallet(wallets: Wallet[], entry: WalletPlanEntry | null) {
  return entry ? wallets.find((wallet) => wallet.id === entry.walletId) ?? null : null;
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function legFromPlan(entry: WalletPlanEntry, wallet: Wallet | null, index: number): JitoLaunchBundlePlanLeg {
  const phase = phaseFor(entry);
  const rail: Rail = phase === 'bundle' ? 'bundle' : phase === 'sniper' ? 'sniper' : phase === 'task' ? 'task' : 'deployment';
  const side: JitoLaunchBundlePlanLeg['side'] = entry.taskType?.includes('sell') || entry.taskType === 'stop-loss' || entry.taskType === 'trailing-stop' || entry.taskType === 'auto-take-profit' ? 'sell' : 'buy';
  const blockers = [
    wallet?.address ? null : 'wallet-address-missing',
    wallet?.custodyMode === 'watch-only' && phase !== 'dev' ? 'watch-only-wallet-cannot-sign-execution-leg' : null,
    entry.maxBuySol > 0 || entry.plannedBuySol > 0 || side === 'sell' ? null : 'leg-sol-cap-missing',
    entry.maxSlippageBps > 0 ? null : 'leg-slippage-missing'
  ].filter((item): item is string => Boolean(item));
  return {
    id: `${rail}-${index}`,
    rail,
    label: `${phase} ${side}`,
    required: phase === 'dev',
    walletId: entry.walletId,
    signer: wallet?.address ?? null,
    side,
    maxSol: Math.max(entry.maxBuySol, entry.plannedBuySol, entry.taskAmountSol ?? 0, entry.taskBuyMaxSol ?? 0),
    slippageBps: entry.maxSlippageBps || null,
    priorityFeeSol: entry.taskPriorityFeeSol ?? null,
    status: blockers.length ? 'blocked' : 'planned',
    blockers
  };
}

export function buildJitoLaunchBundlePlan(
  project: Project | null,
  wallets: Wallet[],
  activation: LiveActivationStatus,
  options: { session?: WalletSigningSessionInput; relay?: JitoRelayReadiness; expectedMint?: string | null; tipLamports?: number; preparedTransactions?: JitoPreparedLaunchTransaction[] } = {}
): JitoLaunchBundlePlan {
  const relay = options.relay ?? getJitoRelayReadiness();
  const walletPlans = walletPlanEntries(project).filter((entry) => entry.participate);
  const devPlan = walletPlans.find((entry) => phaseFor(entry) === 'dev') ?? walletPlans[0] ?? null;
  const dev = planWallet(wallets, devPlan);
  const executablePlans = walletPlans.filter((entry) => ['dev', 'bundle', 'sniper', 'task'].includes(phaseFor(entry)));
  const legs = executablePlans.map((entry, index) => legFromPlan(entry, planWallet(wallets, entry), index));
  const tipLamports = options.tipLamports ?? relay.tip.minLamports;
  const tipLeg: JitoLaunchBundlePlanLeg = {
    id: 'jito-tip',
    rail: 'tip',
    label: 'Jito tip',
    required: true,
    walletId: devPlan?.walletId ?? null,
    signer: dev?.address ?? null,
    side: 'tip',
    maxSol: tipLamports / 1_000_000_000,
    slippageBps: null,
    priorityFeeSol: null,
    status: dev?.address && tipLamports > 0 && tipLamports <= relay.tip.maxLamports ? 'planned' : 'blocked',
    blockers: [
      dev?.address ? null : 'tip-payer-missing',
      tipLamports > 0 ? null : 'jito-tip-missing',
      tipLamports <= relay.tip.maxLamports ? null : 'jito-tip-exceeds-cap'
    ].filter((item): item is string => Boolean(item))
  };
  const allLegs = [...legs, tipLeg];
  const preparedTransactions = options.preparedTransactions ?? [];
  const preparedTransactionBlockers = preparedTransactions.flatMap((tx) => [
    tx.id ? null : 'prepared-transaction-id-missing',
    tx.transactionBase64 ? null : `prepared-transaction-${tx.id || 'unknown'}-base64-missing`,
    tx.expectedSigners.length ? null : `prepared-transaction-${tx.id || 'unknown'}-signers-missing`,
    tx.simulationPolicyStatus === 'passed' ? null : `prepared-transaction-${tx.id || 'unknown'}-simulation-policy-not-passed`
  ].filter((item): item is string => Boolean(item)));
  const allPreparedPoliciesPassed = preparedTransactions.length > 0 && preparedTransactionBlockers.length === 0;
  const signing = project ? buildWalletSigningReadiness(project, wallets, options.session ?? {}) : null;
  const signingOrder = Array.from(new Set([
    ...allLegs.map((leg) => leg.signer).filter((item): item is string => Boolean(item)),
    ...preparedTransactions.flatMap((tx) => tx.expectedSigners)
  ]));
  const plannedMaxSol = allLegs.reduce((sum, leg) => sum + leg.maxSol, 0);
  const maxTotalSol = Math.max(project?.fundingPlan.budgetSol ?? 0, plannedMaxSol);
  const plannedTransactionCount = Math.max(allLegs.length, preparedTransactions.length ? preparedTransactions.length + 1 : allLegs.length);
  const controlledWalletSellLegsBlocked = allLegs.some((leg) => leg.side === 'sell' && (leg.rail === 'bundle' || leg.rail === 'sniper'));
  const blockers = [
    project ? null : 'project-required',
    options.expectedMint ?? project?.tokenMint ?? project?.launchReceipt?.tokenMint ? null : 'expected-mint-missing',
    dev?.address ? null : 'dev-wallet-missing',
    plannedTransactionCount <= relay.limits.maxTransactionsPerBundle ? null : `bundle-exceeds-${relay.limits.maxTransactionsPerBundle}-transaction-limit`,
    tipLamports <= relay.tip.maxLamports ? null : 'jito-tip-exceeds-cap',
    activation.broadcastEnabled ? null : 'broadcast-gate-closed',
    relay.relayEnabled ? null : 'jito-relay-disabled',
    'simulation-proof-required',
    'signed-bundle-review-required',
    controlledWalletSellLegsBlocked ? 'controlled-wallet-sell-leg-requires-extra-review' : null,
    ...preparedTransactionBlockers,
    ...(signing?.bundleSession.blockers ?? []),
    ...allLegs.flatMap((leg) => leg.blockers)
  ].filter((item): item is string => Boolean(item));
  const legHashes = allLegs.map((leg) => ({ id: leg.id, hash: hash({ ...leg, blockers: leg.blockers.sort() }) }));
  const preparedHashes = preparedTransactions.map((tx) => ({ id: tx.id, hash: hash({ id: tx.id, messageHash: tx.messageHash, signers: tx.expectedSigners, simulationPolicyStatus: tx.simulationPolicyStatus }) }));

  return {
    contract: 'bondr-jito-launch-bundle-plan-v1',
    status: blockers.filter((blocker) => !['broadcast-gate-closed', 'jito-relay-disabled', 'simulation-proof-required', 'signed-bundle-review-required'].includes(blocker)).length ? 'blocked' : 'preflight-ready',
    execution: 'launch-bundle-plan-only-no-signing-no-relay-submit',
    projectId: project?.id ?? null,
    expectedMint: options.expectedMint ?? project?.tokenMint ?? project?.launchReceipt?.tokenMint ?? null,
    bundleHash: hash([...legHashes, ...preparedHashes]),
    legHashes,
    legs: allLegs,
    preparedTransactions: {
      count: preparedTransactions.length,
      ids: preparedTransactions.map((tx) => tx.id),
      messageHashes: preparedTransactions.map((tx) => tx.messageHash).filter((item): item is string => Boolean(item)),
      allSimulationPoliciesPassed: allPreparedPoliciesPassed,
      blockers: preparedTransactionBlockers
    },
    signingOrder,
    signingSession: signing?.bundleSession ?? {
      status: 'not-required',
      rail: 'bundle',
      requiredWalletIds: [],
      signedWalletIds: [],
      missingWalletIds: [],
      signingOrder: [],
      nextWalletId: null,
      signedCount: 0,
      missingCount: 0,
      blockhashExpiresAt: null,
      expired: false,
      blockhashFreshness: 'fresh-required-before-signing',
      expiryRebuildRequirement: 'rebuild-all-unsigned-transactions-after-blockhash-expiry',
      blockers: []
    },
    policy: {
      maxTransactions: relay.limits.maxTransactionsPerBundle,
      plannedTransactions: plannedTransactionCount,
      maxTotalSol,
      plannedMaxSol,
      maxSlippageBps: project?.launchConfig?.route?.slippageBps ?? null,
      maxPriorityFeeSol: project?.launchConfig?.devWalletRules?.maxPriorityFeeSol ?? null,
      tipLamports,
      maxTipLamports: relay.tip.maxLamports,
      simulationRequired: true,
      explicitApprovalRequired: true
    },
    relay: {
      status: relay.status,
      relayEnabled: relay.relayEnabled,
      provider: relay.provider
    },
    antiAbuse: {
      noSelfTradeLoop: true,
      noWashTrading: true,
      noFakeVolume: true,
      controlledWalletSellLegsBlocked
    },
    blockers: Array.from(new Set(blockers)),
    warnings: [
      relay.authConfigured ? null : 'jito-auth-not-configured',
      allLegs.length === relay.limits.maxTransactionsPerBundle ? 'bundle-at-transaction-limit' : null
    ].filter((item): item is string => Boolean(item)),
    safety: {
      noSigning: true,
      noBroadcast: true,
      noRelaySubmit: true,
      noServerCustody: true
    }
  };
}
