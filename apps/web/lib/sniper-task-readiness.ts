import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import type { LiveActivationStatus } from './live-activation';
import { getJitoRelayReadiness } from './jito-relay-readiness';
import { walletPlanEntries, type Project, type Wallet, type WalletPlanEntry } from './meridian-store';
import { buildWalletSigningReadiness } from './wallet-signing-readiness';

type ReadinessStatus = 'ready' | 'rehearsal-only' | 'blocked' | 'missing-implementation';

type ReadinessItem = {
  label: string;
  status: ReadinessStatus;
  detail: string;
  blockers: string[];
};

type AutomationProofStatus = 'ready' | 'preview-ready' | 'blocked' | 'stale';

function validPublicKey(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new PublicKey(value).toBase58();
  } catch {
    return null;
  }
}

function collect(items: ReadinessItem[]) {
  return Array.from(new Set(items.flatMap((item) => item.blockers)));
}

function worst(items: ReadinessItem[]): ReadinessStatus {
  const statuses = items.map((item) => item.status);
  if (statuses.includes('missing-implementation')) return 'missing-implementation';
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('rehearsal-only')) return 'rehearsal-only';
  return 'ready';
}

function selectedCount(project: Project | null, phase: 'sniper' | 'task') {
  return walletPlanEntries(project).filter((entry) => entry.participate && entry.executionPhase === phase).length;
}

export function buildSniperExecutionReadiness(project: Project | null, wallets: Wallet[], activation: LiveActivationStatus) {
  const relay = getJitoRelayReadiness();
  const signing = project ? buildWalletSigningReadiness(project, wallets) : null;
  const sniperWallets = selectedCount(project, 'sniper');
  const hasMint = Boolean(project?.tokenMint);
  const items: ReadinessItem[] = [
    { label: 'Trigger source', status: 'rehearsal-only', detail: 'Manual, pool-detector, and webhook trigger sources are modeled; durable live source is still blocked.', blockers: ['durable-sniper-trigger-source-missing'] },
    { label: 'Token/pool detection', status: hasMint ? 'rehearsal-only' : 'blocked', detail: hasMint ? 'Mint exists; pool freshness proof contract exists but needs live indexer observations.' : 'No launched mint/pool to snipe yet.', blockers: hasMint ? ['pool-freshness-indexer-missing'] : ['token-mint-missing'] },
    { label: 'Quote/build path', status: 'rehearsal-only', detail: 'Terminal quote, unsigned build, and simulation path exists for manual swap rehearsal.', blockers: [] },
    { label: 'Simulation policy', status: activation.requireSimulation ? 'rehearsal-only' : 'blocked', detail: 'Simulation must pass before signature or relay submit.', blockers: activation.requireSimulation ? [] : ['simulation-required-disabled'] },
    { label: 'Signer binding', status: signing?.summary.sniperWallets ? 'blocked' : 'rehearsal-only', detail: sniperWallets ? 'Selected sniper wallets need executable signer proof, not watch-only rows.' : 'Manual terminal uses connected browser signer rehearsal.', blockers: sniperWallets ? ['sniper-wallet-signing-session-missing'] : ['connected-browser-signer-proof-required'] },
    { label: 'Relay/RPC submit policy', status: activation.broadcastEnabled && relay.relayEnabled ? 'rehearsal-only' : 'blocked', detail: 'Sniper submit can use normal RPC or Jito fast path after policy approval.', blockers: [activation.broadcastEnabled ? null : 'broadcast-gate-closed', relay.relayEnabled ? null : 'jito-relay-disabled'].filter((item): item is string => Boolean(item)) },
    { label: 'Failure recovery', status: 'rehearsal-only', detail: 'Stale quote, slippage, blockhash expiry, account-lock, and no-blind-retry policy are modeled; runner is not live.', blockers: ['automatic-recovery-runner-missing'] },
    { label: 'Receipts/monitoring', status: 'rehearsal-only', detail: 'Receipt fields, pool freshness, and monitor requirements are modeled; durable monitor is not live.', blockers: ['sniper-receipt-ledger-missing', 'durable-sniper-monitor-missing'] }
  ];
  return {
    contract: 'bondr-sniper-execution-readiness-v1' as const,
    status: worst(items),
    projectId: project?.id ?? null,
    selectedSniperWallets: sniperWallets,
    items,
    blockers: collect(items),
    safety: {
      noAutonomousTrading: true,
      noBroadcast: !activation.broadcastEnabled,
      noFakeVolumeGuardRequired: true
    },
    execution: 'readiness-only-no-sniper-submit' as const
  };
}

export type SniperTriggerPreviewInput = {
  source?: 'manual' | 'pool-detector' | 'webhook';
  mint?: string | null;
  poolId?: string | null;
  poolObservedAt?: string | null;
  poolSlot?: number | null;
  poolLiquidityUsd?: number | null;
  connectedSigner?: string | null;
  amountSol?: number;
  slippageBps?: number;
  simulationProof?: unknown;
};

export function buildSniperPoolFreshnessProof(input: {
  source?: SniperTriggerPreviewInput['source'];
  mint?: string | null;
  poolId?: string | null;
  observedAt?: string | null;
  slot?: number | null;
  liquidityUsd?: number | null;
  maxAgeMs?: number | null;
}) {
  const source = input.source ?? null;
  const mint = validPublicKey(input.mint ?? null);
  const poolId = validPublicKey(input.poolId ?? null);
  const observedAt = input.observedAt ? Date.parse(input.observedAt) : NaN;
  const maxAgeMs = Number.isFinite(input.maxAgeMs) && Number(input.maxAgeMs) > 0 ? Number(input.maxAgeMs) : 45_000;
  const ageMs = Number.isFinite(observedAt) ? Date.now() - observedAt : null;
  const stale = ageMs !== null && ageMs > maxAgeMs;
  const liquidityUsd = typeof input.liquidityUsd === 'number' && Number.isFinite(input.liquidityUsd) ? input.liquidityUsd : null;
  const slot = typeof input.slot === 'number' && Number.isFinite(input.slot) && input.slot > 0 ? Math.floor(input.slot) : null;
  const blockers = [
    source ? null : 'sniper-trigger-source-required',
    source === 'pool-detector' || source === 'webhook' ? null : 'pool-freshness-only-required-for-automated-trigger',
    mint ? null : 'token-mint-required',
    poolId ? null : 'pool-id-required',
    slot ? null : 'pool-slot-required',
    Number.isFinite(observedAt) ? null : 'pool-observed-at-required',
    stale ? 'pool-freshness-stale' : null,
    liquidityUsd !== null && liquidityUsd > 0 ? null : 'pool-liquidity-required'
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'bondr-sniper-pool-freshness-proof-v1' as const,
    status: stale ? 'stale' as AutomationProofStatus : blockers.filter((blocker) => blocker !== 'pool-freshness-only-required-for-automated-trigger').length ? 'blocked' as AutomationProofStatus : 'ready' as AutomationProofStatus,
    source,
    mint,
    poolId,
    slot,
    observedAt: Number.isFinite(observedAt) ? new Date(observedAt).toISOString() : null,
    ageMs,
    maxAgeMs,
    liquidityUsd,
    blockers: Array.from(new Set(blockers)),
    safety: {
      noAutonomousTrading: true,
      noTransactionBuild: true,
      noSigning: true,
      noBroadcast: true
    },
    execution: 'pool-freshness-proof-only-no-sniper-submit' as const
  };
}

export function buildSniperTriggerPreview(project: Project | null, wallets: Wallet[], activation: LiveActivationStatus, input: SniperTriggerPreviewInput = {}) {
  const readiness = buildSniperExecutionReadiness(project, wallets, activation);
  const relay = getJitoRelayReadiness();
  const mint = input.mint?.trim() || project?.tokenMint || null;
  const signer = input.connectedSigner?.trim() || null;
  const amountSol = typeof input.amountSol === 'number' && Number.isFinite(input.amountSol) ? input.amountSol : 0;
  const slippageBps = typeof input.slippageBps === 'number' && Number.isFinite(input.slippageBps) ? input.slippageBps : project?.launchConfig?.route?.slippageBps ?? 100;
  const maxSolPerSwap = activation.limits?.maxSolPerSwap ?? 0.25;
  const maxSlippageBps = activation.limits?.maxSlippageBps ?? 250;
  const walletAddresses = wallets.map((wallet) => wallet.address);
  const poolFreshnessProof = buildSniperPoolFreshnessProof({
    source: input.source,
    mint,
    poolId: input.poolId,
    observedAt: input.poolObservedAt,
    slot: input.poolSlot,
    liquidityUsd: input.poolLiquidityUsd
  });
  const blockers = [
    input.source ? null : 'trigger-source-required',
    mint ? null : 'token-mint-required',
    input.source === 'pool-detector' || input.source === 'webhook'
      ? poolFreshnessProof.status === 'ready' ? null : 'pool-freshness-proof-required'
      : null,
    ...(input.source === 'pool-detector' || input.source === 'webhook' ? poolFreshnessProof.blockers.filter((blocker) => blocker !== 'pool-freshness-only-required-for-automated-trigger') : []),
    signer ? null : 'connected-browser-signer-proof-required',
    signer && walletAddresses.length && !walletAddresses.includes(signer) ? 'connected-signer-not-in-wallet-plan' : null,
    amountSol > 0 ? null : 'sniper-amount-required',
    amountSol > maxSolPerSwap ? 'sniper-amount-exceeds-live-cap' : null,
    slippageBps <= maxSlippageBps ? null : 'sniper-slippage-exceeds-live-cap',
    activation.requireSimulation && !input.simulationProof ? 'simulation-proof-missing' : null,
    activation.broadcastEnabled ? null : 'broadcast-gate-closed',
    relay.relayEnabled ? null : 'jito-relay-disabled'
  ].filter((item): item is string => Boolean(item));
  return {
    contract: 'bondr-sniper-trigger-preview-v1' as const,
    status: blockers.filter((blocker) => !['broadcast-gate-closed', 'jito-relay-disabled', 'simulation-proof-missing'].includes(blocker)).length ? 'blocked' : 'preview-ready',
    projectId: project?.id ?? null,
    trigger: {
      source: input.source ?? null,
      mint,
      poolId: input.poolId ?? null,
      amountSol,
      slippageBps,
      connectedSigner: signer
    },
    poolFreshnessProof,
    readiness,
    relay: {
      relayEnabled: relay.relayEnabled,
      provider: relay.provider,
      blockEngineRegion: relay.blockEngineRegion
    },
    blockers,
    safety: {
      noAutonomousTrading: true,
      noTransactionBuild: true,
      noSigning: true,
      noBroadcast: true
    },
    execution: 'sniper-trigger-preview-only-no-buy-no-broadcast' as const
  };
}

export function buildTaskExecutionReadiness(project: Project | null, wallets: Wallet[], activation: LiveActivationStatus) {
  const relay = getJitoRelayReadiness();
  const signing = project ? buildWalletSigningReadiness(project, wallets) : null;
  const taskWallets = selectedCount(project, 'task');
  const items: ReadinessItem[] = [
    { label: 'Durable worker', status: 'missing-implementation', detail: 'Task execution cannot run inside ordinary Vercel request handlers.', blockers: ['durable-task-worker-missing'] },
    { label: 'Schedule/queue model', status: 'rehearsal-only', detail: 'Queue preview models records, next-run conditions, max runs, cooldown, and idempotency keys.', blockers: ['task-queue-persistence-missing'] },
    { label: 'Pause/resume/cancel', status: 'rehearsal-only', detail: 'Lifecycle preview models pause/resume/cancel controls before worker persistence.', blockers: ['task-lifecycle-persistence-missing'] },
    { label: 'Signer binding', status: signing?.summary.taskWallets ? 'blocked' : 'rehearsal-only', detail: taskWallets ? 'Task wallets need executable signer/session policy.' : 'No task wallets selected for execution.', blockers: taskWallets ? ['task-wallet-signing-session-missing'] : ['task-wallets-not-selected'] },
    { label: 'Cooldown and max runs', status: taskWallets ? 'rehearsal-only' : 'blocked', detail: 'Config fields exist; worker enforcement is still missing.', blockers: taskWallets ? ['task-worker-enforcement-missing'] : ['task-wallets-not-selected'] },
    { label: 'TP/SL/trailing watchers', status: 'rehearsal-only', detail: 'Monitor/recovery preview names TP/SL/trailing watchers; live price/event worker remains blocked.', blockers: ['durable-monitor-worker-missing'] },
    { label: 'Anti-self-trade guard', status: 'blocked', detail: 'Tasks must never create fake volume, self-trade loops, or undisclosed support behavior.', blockers: ['anti-self-trade-policy-required', 'anti-fake-volume-policy-required'] },
    { label: 'Relay/RPC policy', status: activation.broadcastEnabled && relay.relayEnabled ? 'rehearsal-only' : 'blocked', detail: 'Task submit policy must choose normal RPC vs Jito by urgency and risk.', blockers: [activation.broadcastEnabled ? null : 'broadcast-gate-closed', relay.relayEnabled ? null : 'jito-relay-disabled'].filter((item): item is string => Boolean(item)) },
    { label: 'Receipts/recovery', status: 'rehearsal-only', detail: 'Receipt ledger fields and recovery classes are modeled; durable ledger/runner remain blocked.', blockers: ['durable-task-receipt-ledger-missing', 'automatic-recovery-runner-missing'] }
  ];
  return {
    contract: 'bondr-task-execution-readiness-v1' as const,
    status: worst(items),
    projectId: project?.id ?? null,
    selectedTaskWallets: taskWallets,
    items,
    blockers: collect(items),
    safety: {
      noAutonomousTrading: true,
      noBackgroundBroadcast: true,
      noFakeVolume: true,
      broadcastEnabled: activation.broadcastEnabled
    },
    execution: 'readiness-only-no-task-execution' as const
  };
}

export type TaskQueuePreviewInput = {
  taskName?: string | null;
  walletIds?: string[];
  schedule?: 'manual' | 'interval' | 'timestamp';
  intervalSeconds?: number;
  maxRuns?: number;
  cooldownSeconds?: number;
  riskRuleId?: string | null;
  paused?: boolean;
  clockReady?: boolean;
  completedRuns?: number;
  lastRunSecondsAgo?: number | null;
  priceChangePct?: number | null;
  peakGainPct?: number | null;
  drawdownFromPeakPct?: number | null;
};

export type TaskLifecycleState = 'queued' | 'armed' | 'waiting' | 'ready' | 'blocked' | 'signed-required' | 'completed' | 'failed' | 'expired' | 'cancelled';

export type TaskLifecyclePreview = {
  contract: 'bondr-task-lifecycle-preview-v1';
  status: 'ready' | 'waiting' | 'blocked';
  execution: 'task-lifecycle-preview-only-no-worker-no-trading';
  rows: Array<{
    taskId: string;
    idempotencyKey: string;
    walletId: string;
    taskType: WalletPlanEntry['taskType'] | 'timed-buy';
    state: TaskLifecycleState;
    trigger: string;
    side: 'buy' | 'sell' | 'observe';
    maxSol: number;
    sellPct: number;
    blockers: string[];
    nextAction: 'wait' | 'build-unsigned-transaction-after-policy' | 'operator-review-required';
    controls: {
      pause: true;
      resume: true;
      cancel: true;
    };
  }>;
  blockers: string[];
  safety: {
    noAutonomousTrading: true;
    noTransactionBuild: true;
    noSigning: true;
    noBroadcast: true;
    noFakeVolume: true;
  };
};

export type TaskReceiptLedgerPreview = {
  contract: 'bondr-task-receipt-ledger-preview-v1';
  status: 'preview-ready' | 'blocked';
  requiredReceiptFields: string[];
  idempotencyKeys: string[];
  blockers: string[];
  safety: {
    noPersistence: true;
    noSigning: true;
    noBroadcast: true;
    auditRequiredBeforeWorker: true;
  };
  execution: 'receipt-ledger-preview-only-no-worker-no-broadcast';
};

export type TaskMonitorRecoveryPreview = {
  contract: 'bondr-task-monitor-recovery-preview-v1';
  status: 'preview-ready' | 'blocked';
  watchers: Array<{
    taskId: string;
    walletId: string;
    taskType: WalletPlanEntry['taskType'] | 'timed-buy';
    watches: string[];
    recovery: string[];
  }>;
  blockers: string[];
  safety: {
    noLiveMonitor: true;
    noAutomaticRecovery: true;
    noSigning: true;
    noBroadcast: true;
  };
  execution: 'monitor-recovery-preview-only-no-worker-no-trading';
};

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function selectedTaskPlans(project: Project | null, walletIds: string[]) {
  const ids = new Set(walletIds);
  return (project?.launchConfig?.walletPlan ?? []).filter((entry) => entry.participate && entry.executionPhase === 'task' && (!ids.size || ids.has(entry.walletId)));
}

function numberInput(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function taskTrigger(entry: WalletPlanEntry, input: TaskQueuePreviewInput) {
  const taskType = entry.taskType ?? 'timed-buy';
  const priceChangePct = numberInput(input.priceChangePct, 0);
  const peakGainPct = numberInput(input.peakGainPct, 0);
  const drawdownFromPeakPct = numberInput(input.drawdownFromPeakPct, 0);
  if (taskType === 'stop-loss') return { ready: priceChangePct <= entry.stopLossPct, label: `price-change <= ${entry.stopLossPct}%` };
  if (taskType === 'trailing-stop') return { ready: peakGainPct >= (entry.trailingStopPct || 0) && drawdownFromPeakPct >= entry.trailingStopPct, label: `peak >= activation and drawdown >= ${entry.trailingStopPct}%` };
  if (taskType === 'auto-take-profit') {
    const target = entry.takeProfitPercents[0] ?? 0;
    return { ready: target > 0 && priceChangePct >= target, label: `price-change >= ${target}%` };
  }
  if (taskType === 'timed-sell') return { ready: Boolean(input.clockReady), label: 'scheduled sell time reached' };
  if (taskType === 'smart-sell') return { ready: priceChangePct > 0 && Boolean(input.clockReady), label: 'smart sell clock and positive move' };
  return { ready: Boolean(input.clockReady), label: 'scheduled buy time reached' };
}

export function buildTaskLifecyclePreview(project: Project | null, wallets: Wallet[], activation: LiveActivationStatus, input: TaskQueuePreviewInput = {}): TaskLifecyclePreview {
  const walletIds = (input.walletIds ?? []).filter((walletId) => wallets.some((wallet) => wallet.id === walletId));
  const plans = selectedTaskPlans(project, walletIds);
  const completedRuns = numberInput(input.completedRuns, 0);
  const maxRuns = numberInput(input.maxRuns, plans[0]?.taskMaxExecutions ?? 0);
  const cooldownSeconds = numberInput(input.cooldownSeconds, plans[0]?.cooldownSeconds ?? 0);
  const lastRunSecondsAgo = typeof input.lastRunSecondsAgo === 'number' && Number.isFinite(input.lastRunSecondsAgo) ? input.lastRunSecondsAgo : null;
  const baseBlockers = [
    project ? null : 'project-required',
    plans.length ? null : 'task-plan-required',
    input.paused === false ? null : 'task-paused-by-default',
    maxRuns > 0 ? null : 'task-max-runs-required',
    cooldownSeconds > 0 ? null : 'task-cooldown-required',
    activation.broadcastEnabled ? null : 'broadcast-gate-closed'
  ].filter((item): item is string => Boolean(item));
  const rows = plans.map((entry) => {
    const wallet = wallets.find((item) => item.id === entry.walletId) ?? null;
    const trigger = taskTrigger(entry, input);
    const cooldownActive = lastRunSecondsAgo !== null && cooldownSeconds > 0 && lastRunSecondsAgo < cooldownSeconds;
    const completed = maxRuns > 0 && completedRuns >= maxRuns;
    const blockers = [
      ...baseBlockers,
      wallet ? null : 'task-wallet-missing',
      wallet?.custodyMode === 'watch-only' ? 'task-wallet-signing-session-missing' : null,
      completed ? 'task-max-runs-complete' : null,
      cooldownActive ? 'task-cooldown-active' : null
    ].filter((item): item is string => Boolean(item));
    const side: 'buy' | 'sell' | 'observe' = entry.taskType?.includes('sell') || entry.taskType === 'stop-loss' || entry.taskType === 'trailing-stop' || entry.taskType === 'auto-take-profit' ? 'sell' : 'buy';
    const taskId = `task_${hash({ projectId: project?.id ?? null, walletId: entry.walletId, taskType: entry.taskType ?? 'timed-buy', side }).slice(0, 16)}`;
    const idempotencyKey = hash({
      contract: 'bondr-task-lifecycle-preview-v1',
      projectId: project?.id ?? null,
      walletId: entry.walletId,
      taskType: entry.taskType ?? 'timed-buy',
      side,
      completedRuns,
      maxRuns,
      cooldownSeconds,
      trigger: trigger.label
    });
    const nonWaitingBlockers = blockers.filter((blocker) => ![
      'broadcast-gate-closed',
      'task-wallet-signing-session-missing',
      'task-cooldown-active'
    ].includes(blocker));
    const state: TaskLifecycleState = completed
      ? 'completed'
      : nonWaitingBlockers.length
        ? 'blocked'
        : cooldownActive || !trigger.ready
          ? 'waiting'
          : activation.broadcastEnabled
            ? 'signed-required'
            : 'ready';
    return {
      taskId,
      idempotencyKey,
      walletId: entry.walletId,
      taskType: entry.taskType ?? 'timed-buy',
      state,
      trigger: trigger.label,
      side,
      maxSol: Math.max(entry.taskAmountSol ?? 0, entry.taskBuyMaxSol ?? 0, entry.maxBuySol ?? 0),
      sellPct: entry.taskSellPercent ?? entry.taskSellMaxPct ?? 0,
      blockers: Array.from(new Set(blockers)),
      nextAction: state === 'ready' || state === 'signed-required' ? 'build-unsigned-transaction-after-policy' as const : blockers.length ? 'operator-review-required' as const : 'wait' as const,
      controls: {
        pause: true,
        resume: true,
        cancel: true
      } as const
    };
  });
  const blockers = Array.from(new Set([...baseBlockers, ...rows.flatMap((row) => row.blockers)]));
  return {
    contract: 'bondr-task-lifecycle-preview-v1',
    status: rows.some((row) => row.state === 'ready' || row.state === 'signed-required') ? 'ready' : blockers.length ? 'blocked' : 'waiting',
    execution: 'task-lifecycle-preview-only-no-worker-no-trading',
    rows,
    blockers,
    safety: {
      noAutonomousTrading: true,
      noTransactionBuild: true,
      noSigning: true,
      noBroadcast: true,
      noFakeVolume: true
    }
  };
}

export function buildTaskReceiptLedgerPreview(lifecycle: TaskLifecyclePreview): TaskReceiptLedgerPreview {
  const idempotencyKeys = lifecycle.rows.map((row) => row.idempotencyKey);
  const blockers = [
    lifecycle.rows.length ? null : 'task-lifecycle-row-required',
    'durable-task-receipt-ledger-missing',
    'task-worker-not-live'
  ].filter((item): item is string => Boolean(item));
  return {
    contract: 'bondr-task-receipt-ledger-preview-v1',
    status: lifecycle.rows.length ? 'preview-ready' : 'blocked',
    requiredReceiptFields: ['taskId', 'idempotencyKey', 'walletId', 'route', 'side', 'expectedMint', 'expectedSigner', 'transactionMessageHash', 'simulationTransactionMessageHash', 'signedReviewId', 'signature', 'slot', 'status', 'error', 'observedAt'],
    idempotencyKeys,
    blockers,
    safety: {
      noPersistence: true,
      noSigning: true,
      noBroadcast: true,
      auditRequiredBeforeWorker: true
    },
    execution: 'receipt-ledger-preview-only-no-worker-no-broadcast'
  };
}

export function buildTaskMonitorRecoveryPreview(lifecycle: TaskLifecyclePreview): TaskMonitorRecoveryPreview {
  const watchers = lifecycle.rows.map((row) => ({
    taskId: row.taskId,
    walletId: row.walletId,
    taskType: row.taskType,
    watches: row.side === 'sell'
      ? ['price-change', 'take-profit', 'stop-loss', 'trailing-drawdown', 'wallet-token-balance', 'broadcast-receipt']
      : ['scheduled-time', 'wallet-sol-balance', 'quote-freshness', 'broadcast-receipt'],
    recovery: ['expired-blockhash-rebuild-required', 'stale-quote-requote-required', 'account-lock-wait-required', 'simulation-fail-stop-required', 'no-blind-retry']
  }));
  const blockers = [
    watchers.length ? null : 'task-monitor-row-required',
    'durable-monitor-worker-missing',
    'automatic-recovery-runner-missing'
  ].filter((item): item is string => Boolean(item));
  return {
    contract: 'bondr-task-monitor-recovery-preview-v1',
    status: watchers.length ? 'preview-ready' : 'blocked',
    watchers,
    blockers,
    safety: {
      noLiveMonitor: true,
      noAutomaticRecovery: true,
      noSigning: true,
      noBroadcast: true
    },
    execution: 'monitor-recovery-preview-only-no-worker-no-trading'
  };
}

export function buildTaskQueuePreview(project: Project | null, wallets: Wallet[], activation: LiveActivationStatus, input: TaskQueuePreviewInput = {}) {
  const readiness = buildTaskExecutionReadiness(project, wallets, activation);
  const walletIds = (input.walletIds ?? []).filter((walletId) => wallets.some((wallet) => wallet.id === walletId));
  const maxRuns = typeof input.maxRuns === 'number' && Number.isFinite(input.maxRuns) ? input.maxRuns : 0;
  const cooldownSeconds = typeof input.cooldownSeconds === 'number' && Number.isFinite(input.cooldownSeconds) ? input.cooldownSeconds : 0;
  const intervalSeconds = typeof input.intervalSeconds === 'number' && Number.isFinite(input.intervalSeconds) ? input.intervalSeconds : 0;
  const blockers = [
    input.taskName?.trim() ? null : 'task-name-required',
    walletIds.length ? null : 'task-wallet-allowlist-required',
    input.schedule ? null : 'task-schedule-required',
    input.schedule === 'interval' && intervalSeconds <= 0 ? 'task-interval-required' : null,
    maxRuns > 0 ? null : 'task-max-runs-required',
    cooldownSeconds > 0 ? null : 'task-cooldown-required',
    input.riskRuleId?.trim() ? null : 'task-risk-rule-binding-required',
    'durable-task-worker-missing',
    'task-queue-persistence-missing',
    activation.broadcastEnabled ? null : 'broadcast-gate-closed'
  ].filter((item): item is string => Boolean(item));
  const lifecyclePreview = buildTaskLifecyclePreview(project, wallets, activation, { ...input, walletIds });
  const receiptLedgerPreview = buildTaskReceiptLedgerPreview(lifecyclePreview);
  const monitorRecoveryPreview = buildTaskMonitorRecoveryPreview(lifecyclePreview);
  return {
    contract: 'bondr-task-queue-preview-v1' as const,
    status: blockers.filter((blocker) => !['durable-task-worker-missing', 'task-queue-persistence-missing', 'broadcast-gate-closed'].includes(blocker)).length ? 'blocked' : 'preview-ready',
    projectId: project?.id ?? null,
    task: {
      taskName: input.taskName?.trim() || null,
      walletIds,
      schedule: input.schedule ?? null,
      intervalSeconds,
      maxRuns,
      cooldownSeconds,
      riskRuleId: input.riskRuleId?.trim() || null,
      paused: input.paused !== false
    },
    lifecycle: {
      create: 'preview-only',
      pause: 'modeled-by-task-id',
      resume: 'modeled-by-task-id',
      cancel: 'modeled-by-task-id',
      idempotency: 'modeled-before-worker'
    },
    readiness,
    lifecyclePreview,
    receiptLedgerPreview,
    monitorRecoveryPreview,
    blockers,
    safety: {
      noAutonomousTrading: true,
      noBackgroundBroadcast: true,
      noTaskPersistence: true,
      noFakeVolume: true
    },
    execution: 'task-queue-preview-only-no-worker-no-trading' as const
  };
}
