import { walletPlanEntries, type MeridianStore, type Project, type Wallet, type WalletPlanEntry } from './meridian-store';
import type { getLiveActivationStatus } from './live-activation';
import { getJitoRelayReadiness } from './jito-relay-readiness';

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
    nextAction: ipfsReady ? 'Build PumpPortal create preview contract.' : 'Add IPFS metadata pipeline and token metadata preview.',
    steps: [
      step('builder', 'missing-implementation', 'PumpPortal create builder is mapped but not implemented live.', ['pumpportal-create-builder-missing']),
      step('signer', hasProject ? 'rehearsal-only' : 'blocked', 'Browser dev-wallet signing rehearsal only.', hasProject ? [] : ['project-missing']),
      step('simulation', 'rehearsal-only', 'Dry-run and transaction simulation contract exists; deployment-specific simulation still needs builder payload.'),
      step('relay-broadcast', input.activation.deploymentEnabled && input.activation.broadcastEnabled ? 'rehearsal-only' : 'blocked', 'Deploy and broadcast gates remain explicit.', [input.activation.deploymentEnabled ? '' : 'deployment-gate-closed', input.activation.broadcastEnabled ? '' : 'broadcast-gate-closed'].filter(Boolean)),
      step('receipt', 'missing-implementation', 'Post-launch mint/signature/project-state capture is not implemented.', ['deployment-receipt-tracker-missing']),
      step('monitor', ipfsReady ? 'rehearsal-only' : 'blocked', 'Launch monitor needs CA/pool after deploy; IPFS metadata required before real create.', ipfsReady ? [] : ['ipfs-metadata-uri-missing']),
      step('recovery', 'missing-implementation', 'Deploy rebuild/expiry/failure recovery flow is not implemented.', ['deployment-recovery-flow-missing'])
    ]
  });

  const bundle = buildRail({
    rail: 'bundle',
    label: 'Bundle',
    selected: bundlePlans.length > 0,
    summary: bundlePlans.length ? `${bundlePlans.length} selected bundle wallet(s)` : 'No bundle wallets selected',
    nextAction: relay.relayEnabled ? 'Add signed bundle preview and status polling.' : 'Configure Jito relay readiness and signed-bundle policy.',
    steps: [
      step('builder', 'rehearsal-only', 'Bundle sequencer validates legs and can build unsigned swap legs when gates allow.'),
      step('signer', watchOnlyNonDev.length ? 'blocked' : bundlePlans.length ? 'rehearsal-only' : 'blocked', 'Non-dev bundle wallets must be executable signers, not watch-only rows.', watchOnlyNonDev.length ? ['multi-wallet-signing-orchestration-missing'] : bundlePlans.length ? [] : ['bundle-wallets-not-selected']),
      step('simulation', 'rehearsal-only', 'Bundle simulation is required before Jito relay submit.'),
      step('relay-broadcast', relay.relayEnabled && input.activation.broadcastEnabled ? 'rehearsal-only' : 'blocked', 'Jito relay submit is not open until relay and broadcast gates are both approved.', [relay.relayEnabled ? '' : 'jito-relay-disabled', input.activation.broadcastEnabled ? '' : 'broadcast-gate-closed'].filter(Boolean)),
      step('receipt', 'missing-implementation', 'Bundle ID, inflight status, landed/dropped/finalized tracking still needed.', ['bundle-status-tracker-missing']),
      step('monitor', 'missing-implementation', 'Post-bundle wallet balance and buyer-state monitoring still needed.', ['bundle-post-state-monitor-missing']),
      step('recovery', 'missing-implementation', 'Blockhash expiry/rebuild and no-blind-retry policy still needed for bundle flow.', ['bundle-recovery-flow-missing'])
    ]
  });

  const sniper = buildRail({
    rail: 'sniper',
    label: 'Sniper',
    selected: sniperPlans.length > 0,
    summary: sniperPlans.length ? `${sniperPlans.length} selected sniper wallet(s)` : 'Terminal supports manual quote/build/simulate/sign rehearsal',
    nextAction: 'Add sniper trigger readiness endpoint and event source.',
    steps: [
      step('builder', 'rehearsal-only', 'Terminal quote/build/simulate path exists for manual trades.'),
      step('signer', watchOnlyNonDev.length && sniperPlans.length ? 'blocked' : 'rehearsal-only', 'Selected sniper wallet must match an executable signer.', watchOnlyNonDev.length && sniperPlans.length ? ['sniper-signer-orchestration-missing'] : []),
      step('simulation', input.activation.requireSimulation ? 'rehearsal-only' : 'blocked', 'Simulation is required by live activation policy.', input.activation.requireSimulation ? [] : ['simulation-requirement-disabled']),
      step('relay-broadcast', input.activation.broadcastEnabled ? 'rehearsal-only' : 'blocked', 'Manual terminal broadcast is closed in A-profile.', input.activation.broadcastEnabled ? [] : ['broadcast-gate-closed']),
      step('receipt', 'missing-implementation', 'Post-submit signature receipt and fill reconciliation need live broadcast proof.', ['sniper-receipt-tracker-missing']),
      step('monitor', 'missing-implementation', 'Low-latency trigger source, pool event detection, and post-buy monitoring are not implemented.', ['sniper-trigger-engine-missing']),
      step('recovery', 'missing-implementation', 'Sniper stale quote, slippage, blockhash, and account-lock recovery policy still needs wiring.', ['sniper-recovery-flow-missing'])
    ]
  });

  const task = buildRail({
    rail: 'task',
    label: 'Task',
    selected: taskPlans.length > 0,
    summary: taskPlans.length ? `${taskPlans.length} task wallet(s) configured` : 'Task rail is config-only',
    nextAction: 'Add durable task runner/worker readiness before any automation.',
    steps: [
      step('builder', taskPlans.length ? 'rehearsal-only' : 'blocked', 'Task config schema exists; execution builders are not task-bound yet.', taskPlans.length ? [] : ['task-wallets-not-selected']),
      step('signer', watchOnlyNonDev.length && taskPlans.length ? 'blocked' : 'rehearsal-only', 'Task wallets need executable signer model.', watchOnlyNonDev.length && taskPlans.length ? ['task-signer-orchestration-missing'] : []),
      step('simulation', 'missing-implementation', 'Per-task simulation before execution is not implemented.', ['task-simulation-loop-missing']),
      step('relay-broadcast', 'blocked', 'Task broadcast remains closed and must not run from normal request lifecycle.', ['task-broadcast-disabled']),
      step('receipt', 'missing-implementation', 'Task execution receipts and audit ledger are missing.', ['task-receipt-ledger-missing']),
      step('monitor', 'missing-implementation', 'Durable scheduler/worker, TP/SL watchers, and pause/resume/cancel are missing.', ['durable-task-runner-missing']),
      step('recovery', 'missing-implementation', 'Task retry/cooldown/kill-switch recovery is missing.', ['task-recovery-flow-missing'])
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
