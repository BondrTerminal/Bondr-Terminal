import { walletPlanEntries, type MeridianStore, type Project, type Wallet, type WalletPlanEntry } from './meridian-store';
import type { getLiveActivationStatus } from './live-activation';
import { getJitoRelayReadiness } from './jito-relay-readiness';
import { buildExecutionRecoveryReadiness } from './execution-recovery-readiness';
import { buildSniperExecutionReadiness, buildTaskExecutionReadiness } from './sniper-task-readiness';

export type ExecutionTruthStatus = 'ready' | 'rehearsal-only' | 'blocked' | 'missing-implementation';
export type ExecutionSpineStep = 'builder' | 'signer' | 'simulation' | 'relay-broadcast' | 'receipt' | 'monitor' | 'recovery';

export type ExecutionTruthStep = {
  step: ExecutionSpineStep;
  status: ExecutionTruthStatus;
  detail: string;
  blockers: string[];
};

export type ExecutionTruthRail = {
  rail: 'deployment' | 'bundle' | 'sniper' | 'task';
  label: string;
  status: ExecutionTruthStatus;
  selected: boolean;
  summary: string;
  steps: ExecutionTruthStep[];
  blockers: string[];
  nextAction: string;
};

export type ExecutionTruthMap = {
  contract: 'bondr-execution-truth-map-v1';
  projectId: string | null;
  status: ExecutionTruthStatus;
  spine: ExecutionSpineStep[];
  rails: ExecutionTruthRail[];
  blockers: string[];
  warnings: string[];
  gates: {
    liveTradingEnabled: boolean;
    signingEnabled: boolean;
    broadcastEnabled: boolean;
    fundingBroadcastEnabled: boolean;
    deploymentEnabled: boolean;
    jitoRelayEnabled: boolean;
  };
  execution: 'read-only-execution-truth-map-no-signing-no-broadcast';
};

function step(stepName: ExecutionSpineStep, status: ExecutionTruthStatus, detail: string, blockers: string[] = []): ExecutionTruthStep {
  return { step: stepName, status, detail, blockers };
}

function worstStatus(statuses: ExecutionTruthStatus[]): ExecutionTruthStatus {
  if (statuses.includes('missing-implementation')) return 'missing-implementation';
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('rehearsal-only')) return 'rehearsal-only';
  return 'ready';
}

function selectedPlans(project: Project | null, phase: NonNullable<WalletPlanEntry['executionPhase']>) {
  return walletPlanEntries(project).filter((entry) => entry.participate && entry.executionPhase === phase);
}

function nonDevPlans(project: Project | null) {
  return walletPlanEntries(project).filter((entry) => entry.participate && entry.executionPhase !== 'dev');
}

function walletById(wallets: Wallet[]) {
  return new Map(wallets.map((wallet) => [wallet.id, wallet]));
}

function collectBlockers(steps: ExecutionTruthStep[]) {
  return Array.from(new Set(steps.flatMap((item) => item.blockers)));
}

function buildRail(input: Omit<ExecutionTruthRail, 'status' | 'blockers'>): ExecutionTruthRail {
  const blockers = collectBlockers(input.steps);
  return { ...input, blockers, status: worstStatus(input.steps.map((item) => item.status)) };
}

export function buildExecutionTruthMap(input: {
  store: MeridianStore;
  projectId?: string | null;
  activation: ReturnType<typeof getLiveActivationStatus>;
}): ExecutionTruthMap {
  const project = input.projectId ? input.store.projects.find((item) => item.id === input.projectId) ?? null : input.store.projects[0] ?? null;
  const wallets = project ? input.store.wallets.filter((wallet) => wallet.groupId === project.walletGroupId && !wallet.archived) : input.store.wallets.filter((wallet) => !wallet.archived);
  const walletMap = walletById(wallets);
  const relay = getJitoRelayReadiness();
  const bundlePlans = selectedPlans(project, 'bundle');
  const sniperPlans = selectedPlans(project, 'sniper');
  const taskPlans = selectedPlans(project, 'task');
  const sniperReadiness = buildSniperExecutionReadiness(project, wallets, input.activation);
  const taskReadiness = buildTaskExecutionReadiness(project, wallets, input.activation);
  const recoveryReadiness = buildExecutionRecoveryReadiness();
  const nonDev = nonDevPlans(project);
  const watchOnlyNonDev = nonDev.filter((entry) => (walletMap.get(entry.walletId)?.custodyMode ?? 'watch-only') !== 'managed-local');
  const imageUrl = project?.metadata.imageUrl ?? '';
  const ipfsReady = /^ipfs:\/\//i.test(imageUrl) || /\/ipfs\//i.test(imageUrl);
  const riskReady = Boolean(project && walletPlanEntries(project).filter((entry) => entry.participate).every((entry) => entry.stopLossPct < 0 && entry.takeProfitPercents.length && entry.perTxSellCapPct > 0 && entry.cooldownSeconds > 0));
  const hasProject = Boolean(project);

  const deployment = buildRail({
    rail: 'deployment',
    label: 'Deployment',
    selected: hasProject,
    summary: hasProject ? `${project?.metadata.symbol || project?.ticker || 'Token'} launch rehearsal` : 'No project selected',
    nextAction: ipfsReady ? 'Run build -> simulation -> signed review with launch receipt proof.' : 'Add IPFS metadata pipeline and token metadata preview.',
    steps: [
      step('builder', 'rehearsal-only', 'Pump.fun direct unsigned builder exists behind explicit gates; no server signing.'),
      step('signer', hasProject ? 'rehearsal-only' : 'blocked', 'Browser dev-wallet signing rehearsal only.', hasProject ? [] : ['project-missing']),
      step('simulation', 'rehearsal-only', 'Dry-run and transaction simulation bind proof to the unsigned transaction message hash.'),
      step('relay-broadcast', input.activation.deploymentEnabled && input.activation.broadcastEnabled ? 'rehearsal-only' : 'blocked', 'Deploy and broadcast gates remain explicit.', [input.activation.deploymentEnabled ? '' : 'deployment-gate-closed', input.activation.broadcastEnabled ? '' : 'broadcast-gate-closed'].filter(Boolean)),
      step('receipt', 'rehearsal-only', 'Launch receipt persistence and manual reconciliation are proof-bound and auth-protected.'),
      step('monitor', ipfsReady ? 'rehearsal-only' : 'blocked', 'Launch monitor needs CA/pool after deploy; IPFS metadata required before real create.', ipfsReady ? [] : ['ipfs-metadata-uri-missing']),
      step('recovery', 'missing-implementation', 'Deploy rebuild/expiry/failure recovery flow is not implemented.', ['deployment-recovery-flow-missing'])
    ]
  });

  const bundle = buildRail({
    rail: 'bundle',
    label: 'Bundle',
    selected: bundlePlans.length > 0,
    summary: bundlePlans.length ? `${bundlePlans.length} selected bundle wallet(s)` : 'No bundle wallets selected',
    nextAction: relay.relayEnabled ? 'Run route-policy-proven Pump.fun/Raydium/Jupiter inputs through packed build UI and controlled relay-gate test later.' : 'Keep Jito relay disabled until route-policy-proven inputs complete packed proof/sign/wave/chain-effect rehearsal.',
    steps: [
      step('builder', 'rehearsal-only', 'Bundle sequencer can accept Pump.fun/Raydium/Jupiter route-policy-proven source transactions and build packed unsigned v0 transactions.'),
      step('signer', watchOnlyNonDev.length ? 'blocked' : bundlePlans.length ? 'rehearsal-only' : 'blocked', 'Multi-wallet signing session tracks required signatures by transaction message hash.', watchOnlyNonDev.length ? ['non-dev-wallets-must-be-executable-signers'] : bundlePlans.length ? [] : ['bundle-wallets-not-selected']),
      step('simulation', 'rehearsal-only', 'Packed transaction proof requires ok simulation evidence bound to the packed message hash.'),
      step('relay-broadcast', relay.relayEnabled && input.activation.broadcastEnabled ? 'rehearsal-only' : 'blocked', 'Jito relay submit is not open until relay and broadcast gates are both approved.', [relay.relayEnabled ? '' : 'jito-relay-disabled', input.activation.broadcastEnabled ? '' : 'broadcast-gate-closed'].filter(Boolean)),
      step('receipt', 'rehearsal-only', 'Bundle status receipts normalize Jito inflight/final rows but remain relay-only proof.'),
      step('monitor', 'rehearsal-only', 'Post-chain effect proof requires wallet/mint/signature/slot/token-delta observations after landing.'),
      step('recovery', 'rehearsal-only', 'Signing sessions and wave plans expose blockhash expiry, prior-wave receipt, and no-blind-submit requirements.')
    ]
  });

  const sniper = buildRail({
    rail: 'sniper',
    label: 'Sniper',
    selected: sniperPlans.length > 0,
    summary: sniperPlans.length ? `${sniperPlans.length} selected sniper wallet(s)` : 'Terminal supports manual quote/build/simulate/sign rehearsal',
    nextAction: 'Use /api/sniper/trigger-preview for manual trigger proof, then add durable pool/webhook trigger sources.',
    steps: [
      step('builder', 'rehearsal-only', 'Terminal quote/build/simulate path exists, and sniper trigger preview models manual/pool/webhook sources plus pool freshness without building a buy.', sniperReadiness.blockers.includes('durable-sniper-trigger-source-missing') ? ['durable-sniper-trigger-source-missing'] : []),
      step('signer', watchOnlyNonDev.length && sniperPlans.length ? 'blocked' : 'rehearsal-only', 'Selected sniper wallet must match an executable signer.', watchOnlyNonDev.length && sniperPlans.length ? ['sniper-signer-orchestration-missing'] : []),
      step('simulation', input.activation.requireSimulation ? 'rehearsal-only' : 'blocked', 'Simulation is required by live activation policy.', input.activation.requireSimulation ? [] : ['simulation-requirement-disabled']),
      step('relay-broadcast', input.activation.broadcastEnabled ? 'rehearsal-only' : 'blocked', 'Manual terminal broadcast is closed in A-profile.', input.activation.broadcastEnabled ? [] : ['broadcast-gate-closed']),
      step('receipt', 'rehearsal-only', 'Post-submit signature receipt and fill reconciliation are modeled as required proof before live sniper execution.', sniperReadiness.blockers.filter((blocker) => blocker === 'sniper-receipt-ledger-missing' || blocker === 'durable-sniper-monitor-missing')),
      step('monitor', 'blocked', 'Low-latency trigger source, pool freshness proof, and post-buy monitoring are required before autonomous sniper mode.', ['sniper-trigger-engine-missing', ...sniperReadiness.blockers.filter((blocker) => blocker === 'pool-freshness-indexer-missing')]),
      step('recovery', 'rehearsal-only', 'Recovery policy classifies stale quotes, expired blockhash, account locks, and no-blind-retry behavior.', recoveryReadiness.blockers.includes('automatic-recovery-runner-missing') ? ['automatic-recovery-runner-missing'] : [])
    ]
  });

  const task = buildRail({
    rail: 'task',
    label: 'Task',
    selected: taskPlans.length > 0,
    summary: taskPlans.length ? `${taskPlans.length} task wallet(s) configured` : 'Task rail is config-only',
    nextAction: 'Use /api/tasks/queue-preview for lifecycle proof, then add durable worker persistence before any automation.',
    steps: [
      step('builder', taskPlans.length ? 'rehearsal-only' : 'blocked', 'Task queue preview models task shape, schedule, idempotency, cooldown, and lifecycle without building transactions.', taskPlans.length ? [] : ['task-wallets-not-selected']),
      step('signer', watchOnlyNonDev.length && taskPlans.length ? 'blocked' : 'rehearsal-only', 'Task wallets need executable signer model.', watchOnlyNonDev.length && taskPlans.length ? ['task-signer-orchestration-missing'] : []),
      step('simulation', 'rehearsal-only', 'Task lifecycle preview marks ready tasks as unsigned-build candidates; every eventual execution still requires quote/build/simulation proof.', input.activation.requireSimulation ? [] : ['simulation-requirement-disabled']),
      step('relay-broadcast', 'blocked', 'Task broadcast remains closed and must not run from normal request lifecycle.', ['task-broadcast-disabled']),
      step('receipt', 'rehearsal-only', 'Task execution receipt fields and audit ledger preview are modeled before live automation.', taskReadiness.blockers.filter((blocker) => blocker === 'durable-task-receipt-ledger-missing' || blocker === 'automatic-recovery-runner-missing')),
      step('monitor', 'blocked', 'Durable scheduler/worker, TP/SL watchers, and pause/resume/cancel persistence remain required before automation.', ['durable-task-runner-missing', ...taskReadiness.blockers.filter((blocker) => blocker === 'durable-monitor-worker-missing')]),
      step('recovery', 'rehearsal-only', 'Cooldown, max-run, kill-switch, and no-blind-retry recovery rules are modeled before worker implementation.', recoveryReadiness.blockers.includes('automatic-recovery-runner-missing') ? ['automatic-recovery-runner-missing'] : [])
    ]
  });

  const rails = [deployment, bundle, sniper, task];
  const blockers = Array.from(new Set(rails.flatMap((rail) => rail.blockers)));
  const warnings = [
    riskReady ? null : 'risk-rules-not-ready',
    relay.warnings[0] ?? null
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'bondr-execution-truth-map-v1',
    projectId: project?.id ?? null,
    status: worstStatus(rails.map((rail) => rail.status)),
    spine: ['builder', 'signer', 'simulation', 'relay-broadcast', 'receipt', 'monitor', 'recovery'],
    rails,
    blockers,
    warnings,
    gates: {
      liveTradingEnabled: input.activation.liveTradingEnabled,
      signingEnabled: input.activation.signingEnabled,
      broadcastEnabled: input.activation.broadcastEnabled,
      fundingBroadcastEnabled: input.activation.fundingBroadcastEnabled,
      deploymentEnabled: input.activation.deploymentEnabled,
      jitoRelayEnabled: relay.relayEnabled
    },
    execution: 'read-only-execution-truth-map-no-signing-no-broadcast'
  };
}
