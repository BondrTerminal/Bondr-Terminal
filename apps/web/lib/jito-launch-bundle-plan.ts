import { createHash } from 'node:crypto';
import type { LiveActivationStatus } from './live-activation';
import type { JitoRelayReadiness } from './jito-relay-readiness';
import { getJitoRelayReadiness } from './jito-relay-readiness';
import { walletPlanEntries, type Project, type Wallet, type WalletPlanEntry } from './meridian-store';
import { buildWalletSigningReadiness, type WalletSigningSessionInput } from './wallet-signing-readiness';

type Rail = 'deployment' | 'bundle' | 'sniper' | 'task' | 'tip';
type AtomicityMode = 'single-atomic-bundle' | 'near-synchronous-waves';

const SOLANA_MAX_SERIALIZED_TRANSACTION_BYTES = 1232;
const DEFAULT_MAX_WALLETS_PER_PACKED_TRANSACTION = 4;
const HARD_MAX_WALLETS_PER_PACKED_TRANSACTION = 6;

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
  rail?: Rail;
  transactionBase64: string;
  expectedSigners: string[];
  messageHash: string | null;
  simulationPolicyStatus: 'passed' | 'blocked' | string;
};

export type JitoWalletRailSynchronization = {
  contract: 'bondr-jito-wallet-rail-synchronization-v1';
  status: 'in-sync' | 'blocked';
  routePath: 'deployment-wallet-rails-to-jito-bundle';
  railOrder: Rail[];
  walletRails: Array<{
    legId: string;
    rail: Rail;
    routePath: string;
    walletId: string | null;
    signer: string | null;
    signingIndex: number | null;
    preparedTransactionIds: string[];
    messageHashes: string[];
    blockhashExpiresAt: string | null;
    blockers: string[];
  }>;
  signingOrder: string[];
  messageHashes: string[];
  blockhashExpiresAt: string | null;
  expired: boolean;
  blockers: string[];
  safety: {
    noSigning: true;
    noRelaySubmit: true;
    rebuildAllOnExpiry: true;
    railsMustShareBundleHash: true;
  };
};

export type JitoPackedWalletTransactionPlan = {
  id: string;
  waveIndex: number;
  transactionIndex: number;
  rails: Rail[];
  walletLegIds: string[];
  walletIds: string[];
  signers: string[];
  side: 'create' | 'buy' | 'sell' | 'tip' | 'observe' | 'mixed';
  walletCount: number;
  maxWalletsPerPackedTransaction: number;
  preparedTransactionIds: string[];
  messageHashes: string[];
  addressLookupTables: {
    required: boolean;
    status: 'not-required' | 'proof-required' | 'planned';
  };
  transactionLimits: {
    maxSerializedBytes: number;
    simulationRequired: true;
    computeBudgetRequired: true;
  };
  blockers: string[];
};

export type JitoPackedExecutionWavePlan = {
  waveIndex: number;
  label: string;
  mode: 'jito-send-bundle';
  transactionCount: number;
  walletCount: number;
  walletIds: string[];
  transactionIds: string[];
  atomicWithinWave: true;
  atomicAcrossWaves: false;
  submitAfterWaveIndex: number | null;
  status: 'planned' | 'blocked';
  blockers: string[];
};

export type JitoPackedExecutionPlan = {
  contract: 'bondr-jito-packed-execution-plan-v1';
  status: 'planned' | 'blocked';
  mode: AtomicityMode;
  maxTransactionsPerBundle: number;
  maxWalletsPerPackedTransaction: number;
  totalWallets: number;
  totalTransactions: number;
  waveCount: number;
  tipStrategy: 'embed-tip-in-first-transaction' | 'separate-tip-transaction';
  transactions: JitoPackedWalletTransactionPlan[];
  waves: JitoPackedExecutionWavePlan[];
  atomicity: {
    withinTransaction: true;
    withinWave: true;
    acrossWaves: false;
    label: 'atomic-single-jito-bundle' | 'near-synchronous-jito-waves';
  };
  synchronization: {
    blockhashSharedAcrossAllWaves: true;
    rebuildAllWavesOnExpiry: true;
    chainProofRequiredAfterEachWave: true;
    waveSubmitRequiresPreviousWaveReceipt: boolean;
  };
  safeguards: {
    addressLookupTableProofRequired: boolean;
    simulationProofPerPackedTransaction: true;
    signedReviewPerPackedTransaction: true;
    noServerCustody: true;
    noRelaySubmit: true;
  };
  blockers: string[];
  warnings: string[];
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
  synchronization: JitoWalletRailSynchronization;
  packedExecution: JitoPackedExecutionPlan;
  signingOrder: string[];
  signingSession: ReturnType<typeof buildWalletSigningReadiness>['bundleSession'];
  policy: {
    maxTransactions: number;
    plannedTransactions: number;
    plannedWaves: number;
    atomicityMode: AtomicityMode;
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

function numericEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampWalletsPerPackedTransaction(value: number) {
  return Math.max(1, Math.min(Math.floor(value), HARD_MAX_WALLETS_PER_PACKED_TRANSACTION));
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function mixedSide(legs: JitoLaunchBundlePlanLeg[]): JitoPackedWalletTransactionPlan['side'] {
  const sides = Array.from(new Set(legs.map((leg) => leg.side)));
  return sides.length === 1 ? sides[0] : 'mixed';
}

function routePathForRail(rail: Rail) {
  if (rail === 'deployment') return '/deployment -> launch bundle plan -> signed review -> Jito bundle';
  if (rail === 'bundle') return 'wallet plan(bundle) -> per-wallet build -> signed review -> Jito bundle';
  if (rail === 'sniper') return '/sniper -> trigger preview -> signed review -> Jito bundle';
  if (rail === 'task') return 'task queue -> due task preview -> signed review -> Jito bundle';
  return 'Jito tip payer -> tip transaction -> Jito bundle';
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

function buildWalletRailSynchronization(input: {
  legs: JitoLaunchBundlePlanLeg[];
  preparedTransactions: JitoPreparedLaunchTransaction[];
  signingOrder: string[];
  signingSession: ReturnType<typeof buildWalletSigningReadiness>['bundleSession'];
  maxTransactions: number;
}): JitoWalletRailSynchronization {
  const blockhashExpiresAt = input.signingSession.blockhashExpiresAt;
  const expired = input.signingSession.expired;
  const walletRails = input.legs.map((leg) => {
    const prepared = input.preparedTransactions.filter((tx) => (leg.signer && tx.expectedSigners.includes(leg.signer)) || tx.rail === leg.rail);
    const messageHashes = prepared.map((tx) => tx.messageHash).filter((item): item is string => Boolean(item));
    const signingIndex = leg.signer ? input.signingOrder.indexOf(leg.signer) : -1;
    const blockers = [
      leg.signer ? null : `leg-${leg.id}-signer-missing`,
      leg.signer && signingIndex >= 0 ? null : `leg-${leg.id}-signer-missing-from-signing-order`,
      leg.rail === 'tip' || prepared.length ? null : `leg-${leg.id}-prepared-transaction-required`,
      prepared.some((tx) => !tx.messageHash) ? `leg-${leg.id}-message-hash-required` : null,
      prepared.some((tx) => tx.simulationPolicyStatus !== 'passed') ? `leg-${leg.id}-simulation-policy-not-passed` : null,
      ...leg.blockers
    ].filter((item): item is string => Boolean(item));
    return {
      legId: leg.id,
      rail: leg.rail,
      routePath: routePathForRail(leg.rail),
      walletId: leg.walletId,
      signer: leg.signer,
      signingIndex: signingIndex >= 0 ? signingIndex : null,
      preparedTransactionIds: prepared.map((tx) => tx.id),
      messageHashes,
      blockhashExpiresAt,
      blockers: Array.from(new Set(blockers))
    };
  });
  const blockers = [
    input.preparedTransactions.length <= input.maxTransactions ? null : `bundle-exceeds-${input.maxTransactions}-transaction-limit`,
    expired ? 'blockhash-expired-rebuild-required' : null,
    ...input.signingSession.blockers,
    ...walletRails.flatMap((row) => row.blockers)
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'bondr-jito-wallet-rail-synchronization-v1',
    status: blockers.length ? 'blocked' : 'in-sync',
    routePath: 'deployment-wallet-rails-to-jito-bundle',
    railOrder: input.legs.map((leg) => leg.rail),
    walletRails,
    signingOrder: input.signingOrder,
    messageHashes: Array.from(new Set(input.preparedTransactions.map((tx) => tx.messageHash).filter((item): item is string => Boolean(item)))),
    blockhashExpiresAt,
    expired,
    blockers: Array.from(new Set(blockers)),
    safety: {
      noSigning: true,
      noRelaySubmit: true,
      rebuildAllOnExpiry: true,
      railsMustShareBundleHash: true
    }
  };
}

function buildPackedExecutionPlan(input: {
  legs: JitoLaunchBundlePlanLeg[];
  preparedTransactions: JitoPreparedLaunchTransaction[];
  maxTransactionsPerBundle: number;
  maxWalletsPerPackedTransaction: number;
}): JitoPackedExecutionPlan {
  const maxWalletsPerPackedTransaction = clampWalletsPerPackedTransaction(input.maxWalletsPerPackedTransaction);
  const nonTipLegs = input.legs.filter((leg) => leg.rail !== 'tip');
  const preparedIds = new Set(input.preparedTransactions.map((tx) => tx.id));
  const preparedTransactions: JitoPackedWalletTransactionPlan[] = input.preparedTransactions.map((tx, index) => ({
    id: tx.id || `prepared-${index}`,
    waveIndex: 0,
    transactionIndex: index,
    rails: tx.rail ? [tx.rail] : [],
    walletLegIds: [],
    walletIds: [],
    signers: tx.expectedSigners,
    side: 'mixed',
    walletCount: tx.expectedSigners.length,
    maxWalletsPerPackedTransaction,
    preparedTransactionIds: tx.id ? [tx.id] : [],
    messageHashes: tx.messageHash ? [tx.messageHash] : [],
    addressLookupTables: {
      required: tx.expectedSigners.length > 1,
      status: tx.expectedSigners.length > 1 ? 'proof-required' : 'not-required'
    },
    transactionLimits: {
      maxSerializedBytes: SOLANA_MAX_SERIALIZED_TRANSACTION_BYTES,
      simulationRequired: true,
      computeBudgetRequired: true
    },
    blockers: [
      tx.expectedSigners.length > maxWalletsPerPackedTransaction ? `prepared-transaction-${tx.id || 'unknown'}-exceeds-packed-wallet-limit` : null,
      tx.expectedSigners.length > 1 ? `prepared-transaction-${tx.id || 'unknown'}-address-lookup-table-proof-required` : null,
      tx.messageHash ? null : `prepared-transaction-${tx.id || 'unknown'}-message-hash-required`,
      tx.simulationPolicyStatus === 'passed' ? null : `prepared-transaction-${tx.id || 'unknown'}-simulation-policy-not-passed`
    ].filter((item): item is string => Boolean(item))
  }));

  const preparedSigners = new Set(input.preparedTransactions.flatMap((tx) => tx.expectedSigners));
  const unpackedLegs = nonTipLegs.filter((leg) => !leg.signer || !preparedSigners.has(leg.signer));
  const packedTransactions = chunk(unpackedLegs, maxWalletsPerPackedTransaction).map((legs, index): JitoPackedWalletTransactionPlan => {
    const signers = legs.map((leg) => leg.signer).filter((item): item is string => Boolean(item));
    const addressLookupTableRequired = legs.length > 1;
    const blockers = [
      legs.some((leg) => !leg.signer) ? `packed-transaction-${index}-signer-missing` : null,
      addressLookupTableRequired ? `packed-transaction-${index}-address-lookup-table-proof-required` : null,
      `packed-transaction-${index}-simulation-proof-required`,
      `packed-transaction-${index}-signed-review-required`,
      ...legs.flatMap((leg) => leg.blockers)
    ].filter((item): item is string => Boolean(item));
    return {
      id: `packed-${index}`,
      waveIndex: 0,
      transactionIndex: index,
      rails: Array.from(new Set(legs.map((leg) => leg.rail))),
      walletLegIds: legs.map((leg) => leg.id),
      walletIds: legs.map((leg) => leg.walletId).filter((item): item is string => Boolean(item)),
      signers,
      side: mixedSide(legs),
      walletCount: legs.length,
      maxWalletsPerPackedTransaction,
      preparedTransactionIds: [],
      messageHashes: [],
      addressLookupTables: {
        required: addressLookupTableRequired,
        status: addressLookupTableRequired ? 'proof-required' : 'not-required'
      },
      transactionLimits: {
        maxSerializedBytes: SOLANA_MAX_SERIALIZED_TRANSACTION_BYTES,
        simulationRequired: true,
        computeBudgetRequired: true
      },
      blockers: Array.from(new Set(blockers))
    };
  });

  const transactionPlans = preparedTransactions.length ? preparedTransactions : packedTransactions;
  const waveChunks = chunk(transactionPlans, input.maxTransactionsPerBundle);
  const waves = waveChunks.map((transactions, waveIndex): JitoPackedExecutionWavePlan => {
    const waveBlockers = [
      transactions.length <= input.maxTransactionsPerBundle ? null : `wave-${waveIndex}-exceeds-${input.maxTransactionsPerBundle}-transaction-limit`,
      ...transactions.flatMap((tx) => tx.blockers)
    ].filter((item): item is string => Boolean(item));
    return {
      waveIndex,
      label: waveIndex === 0 ? 'primary launch bundle wave' : `overflow bundle wave ${waveIndex}`,
      mode: 'jito-send-bundle',
      transactionCount: transactions.length,
      walletCount: transactions.reduce((sum, tx) => sum + tx.walletCount, 0),
      walletIds: Array.from(new Set(transactions.flatMap((tx) => tx.walletIds))),
      transactionIds: transactions.map((tx) => tx.id),
      atomicWithinWave: true,
      atomicAcrossWaves: false,
      submitAfterWaveIndex: waveIndex === 0 ? null : waveIndex - 1,
      status: waveBlockers.length ? 'blocked' : 'planned',
      blockers: Array.from(new Set(waveBlockers))
    };
  });
  const transactions = waves.flatMap((wave) => {
    const waveTransactions = transactionPlans.filter((tx) => wave.transactionIds.includes(tx.id));
    return waveTransactions.map((tx, index) => ({ ...tx, waveIndex: wave.waveIndex, transactionIndex: index }));
  });
  const waveCount = waves.length || 1;
  const blockers = Array.from(new Set(waves.flatMap((wave) => wave.blockers)));
  const mode: AtomicityMode = waveCount > 1 ? 'near-synchronous-waves' : 'single-atomic-bundle';
  const addressLookupTableProofRequired = transactions.some((tx) => tx.addressLookupTables.required);

  return {
    contract: 'bondr-jito-packed-execution-plan-v1',
    status: blockers.length ? 'blocked' : 'planned',
    mode,
    maxTransactionsPerBundle: input.maxTransactionsPerBundle,
    maxWalletsPerPackedTransaction,
    totalWallets: nonTipLegs.length,
    totalTransactions: transactions.length,
    waveCount,
    tipStrategy: 'embed-tip-in-first-transaction',
    transactions,
    waves,
    atomicity: {
      withinTransaction: true,
      withinWave: true,
      acrossWaves: false,
      label: mode === 'single-atomic-bundle' ? 'atomic-single-jito-bundle' : 'near-synchronous-jito-waves'
    },
    synchronization: {
      blockhashSharedAcrossAllWaves: true,
      rebuildAllWavesOnExpiry: true,
      chainProofRequiredAfterEachWave: true,
      waveSubmitRequiresPreviousWaveReceipt: waveCount > 1
    },
    safeguards: {
      addressLookupTableProofRequired,
      simulationProofPerPackedTransaction: true,
      signedReviewPerPackedTransaction: true,
      noServerCustody: true,
      noRelaySubmit: true
    },
    blockers,
    warnings: [
      waveCount > 1 ? 'multi-wave-plan-is-not-atomic-across-waves' : null,
      preparedIds.size && packedTransactions.length ? 'prepared-transactions-take-priority-over-estimated-packing' : null
    ].filter((item): item is string => Boolean(item))
  };
}

export function buildJitoLaunchBundlePlan(
  project: Project | null,
  wallets: Wallet[],
  activation: LiveActivationStatus,
  options: { session?: WalletSigningSessionInput; relay?: JitoRelayReadiness; expectedMint?: string | null; tipLamports?: number; preparedTransactions?: JitoPreparedLaunchTransaction[]; maxWalletsPerPackedTransaction?: number } = {}
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
  const packedExecution = buildPackedExecutionPlan({
    legs: allLegs,
    preparedTransactions,
    maxTransactionsPerBundle: relay.limits.maxTransactionsPerBundle,
    maxWalletsPerPackedTransaction: options.maxWalletsPerPackedTransaction ?? numericEnv('JITO_MAX_WALLETS_PER_PACKED_TRANSACTION', DEFAULT_MAX_WALLETS_PER_PACKED_TRANSACTION)
  });
  const signing = project ? buildWalletSigningReadiness(project, wallets, options.session ?? {}) : null;
  const signingOrder = Array.from(new Set([
    ...allLegs.map((leg) => leg.signer).filter((item): item is string => Boolean(item)),
    ...preparedTransactions.flatMap((tx) => tx.expectedSigners)
  ]));
  const plannedMaxSol = allLegs.reduce((sum, leg) => sum + leg.maxSol, 0);
  const maxTotalSol = Math.max(project?.fundingPlan.budgetSol ?? 0, plannedMaxSol);
  const plannedTransactionCount = Math.max(packedExecution.totalTransactions, 1);
  const controlledWalletSellLegsBlocked = allLegs.some((leg) => leg.side === 'sell' && (leg.rail === 'bundle' || leg.rail === 'sniper'));
  const blockers = [
    project ? null : 'project-required',
    options.expectedMint ?? project?.tokenMint ?? project?.launchReceipt?.tokenMint ? null : 'expected-mint-missing',
    dev?.address ? null : 'dev-wallet-missing',
    tipLamports <= relay.tip.maxLamports ? null : 'jito-tip-exceeds-cap',
    activation.broadcastEnabled ? null : 'broadcast-gate-closed',
    relay.relayEnabled ? null : 'jito-relay-disabled',
    'simulation-proof-required',
    'signed-bundle-review-required',
    controlledWalletSellLegsBlocked ? 'controlled-wallet-sell-leg-requires-extra-review' : null,
    ...preparedTransactionBlockers,
    ...packedExecution.blockers,
    ...(signing?.bundleSession.blockers ?? []),
    ...allLegs.flatMap((leg) => leg.blockers)
  ].filter((item): item is string => Boolean(item));
  const legHashes = allLegs.map((leg) => ({ id: leg.id, hash: hash({ ...leg, blockers: leg.blockers.sort() }) }));
  const preparedHashes = preparedTransactions.map((tx) => ({ id: tx.id, hash: hash({ id: tx.id, messageHash: tx.messageHash, signers: tx.expectedSigners, simulationPolicyStatus: tx.simulationPolicyStatus }) }));
  const synchronization = buildWalletRailSynchronization({
    legs: allLegs,
    preparedTransactions,
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
    maxTransactions: relay.limits.maxTransactionsPerBundle
  });
  const readinessBlockers = Array.from(new Set([...blockers, ...synchronization.blockers]));

  return {
    contract: 'bondr-jito-launch-bundle-plan-v1',
    status: readinessBlockers.filter((blocker) => !['broadcast-gate-closed', 'jito-relay-disabled', 'simulation-proof-required', 'signed-bundle-review-required'].includes(blocker)).length ? 'blocked' : 'preflight-ready',
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
    synchronization,
    packedExecution,
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
      plannedWaves: packedExecution.waveCount,
      atomicityMode: packedExecution.mode,
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
    blockers: readinessBlockers,
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
