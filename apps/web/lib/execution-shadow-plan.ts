import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import type { LiveActivationStatus } from './live-activation';
import { getJitoRelayReadiness } from './jito-relay-readiness';
import { buildJitoBundlePreview, type JitoBundlePayload } from './jito-relay-adapter';
import { buildPumpPortalCreatePreview } from './pumpportal-deploy-readiness';
import { buildSniperTriggerPreview, buildTaskQueuePreview } from './sniper-task-readiness';
import { buildWalletSigningReadiness } from './wallet-signing-readiness';
import { buildExecutionRecoveryReadiness } from './execution-recovery-readiness';
import type { Project, Wallet } from './meridian-store';

const globalForShadowPlan = globalThis as typeof globalThis & {
  __bondrShadowPlanPool?: Pool;
  __bondrShadowPlanSchemaReady?: Promise<void>;
};

export type ShadowPlanInput = {
  mintPublicKey?: string | null;
  connectedSigner?: string | null;
  signedTransactions?: unknown;
  expectedSigners?: unknown;
  tipLamports?: unknown;
  simulationProof?: unknown;
  approvalId?: unknown;
  persistAudit?: boolean;
};

export type ShadowExecutionPacket = {
  contract: 'bondr-shadow-execution-packet-v1';
  status: 'shadow-ready' | 'blocked';
  observedAt: string;
  projectId: string;
  packetHash: string;
  completeness: {
    backendScore: number;
    shadowExecutableScore: number;
    readyStages: number;
    totalStages: number;
    missingStages: string[];
  };
  spine: Array<{
    step: 'metadata' | 'builder' | 'signer' | 'simulation' | 'relay' | 'receipt' | 'monitor' | 'recovery' | 'kill-switch';
    status: 'ready' | 'shadow-ready' | 'blocked';
    blockers: string[];
    detail: string;
  }>;
  launch: ReturnType<typeof buildPumpPortalCreatePreview>;
  signing: ReturnType<typeof buildWalletSigningReadiness>;
  relay: ReturnType<typeof buildJitoBundlePreview>;
  sniper: ReturnType<typeof buildSniperTriggerPreview>;
  task: ReturnType<typeof buildTaskQueuePreview>;
  recovery: ReturnType<typeof buildExecutionRecoveryReadiness>;
  blockers: string[];
  warnings: string[];
  audit: {
    persisted: boolean;
    storage: 'postgres' | 'not-configured' | 'disabled' | 'error';
    auditId: string;
    error?: string;
  };
  gates: {
    signingEnabled: boolean;
    broadcastEnabled: boolean;
    fundingBroadcastEnabled: boolean;
    deploymentEnabled: boolean;
    jitoRelayEnabled: boolean;
  };
  safety: {
    noSigning: true;
    noBroadcast: true;
    noFunding: true;
    noDeployment: true;
    noPrivateKeys: true;
    shadowMode: true;
  };
  execution: 'shadow-plan-only-no-signing-no-broadcast';
};

function dbUrl() {
  return process.env.WALLET_STORE_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || '';
}

function auditPersistenceEnabled() {
  return process.env.MUTATIONS_DISABLED !== 'true' && Boolean(dbUrl());
}

function pool() {
  const url = dbUrl();
  if (!url) return null;
  if (!globalForShadowPlan.__bondrShadowPlanPool) {
    globalForShadowPlan.__bondrShadowPlanPool = new Pool({ connectionString: url, max: 1, idleTimeoutMillis: 10_000 });
  }
  return globalForShadowPlan.__bondrShadowPlanPool;
}

async function ensureSchema() {
  const db = pool();
  if (!db) return;
  if (!globalForShadowPlan.__bondrShadowPlanSchemaReady) {
    globalForShadowPlan.__bondrShadowPlanSchemaReady = db.query(`
      create table if not exists bondr_shadow_execution_packets (
        id text primary key,
        project_id text not null,
        packet_hash text not null,
        payload jsonb not null,
        observed_at timestamptz not null default now()
      )
    `).then(() => undefined);
  }
  await globalForShadowPlan.__bondrShadowPlanSchemaReady;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : [];
}

function hashPacket(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function uniq(items: Array<string | null | undefined>) {
  return Array.from(new Set(items.filter((item): item is string => Boolean(item))));
}

function stage(step: ShadowExecutionPacket['spine'][number]['step'], blockers: string[], detail: string, gateOnlyBlockers: string[] = []) {
  const hardBlockers = blockers.filter((blocker) => !gateOnlyBlockers.includes(blocker));
  return {
    step,
    status: hardBlockers.length ? 'blocked' as const : blockers.length ? 'shadow-ready' as const : 'ready' as const,
    blockers,
    detail
  };
}

async function persistPacket(packet: Omit<ShadowExecutionPacket, 'audit'>, persistAudit?: boolean): Promise<ShadowExecutionPacket['audit']> {
  const auditId = `shadow-${packet.projectId}-${packet.observedAt.replace(/[^0-9]/g, '')}`;
  if (!persistAudit) return { persisted: false, storage: 'disabled', auditId };
  if (!auditPersistenceEnabled()) return { persisted: false, storage: dbUrl() ? 'disabled' : 'not-configured', auditId };
  try {
    const db = pool();
    if (!db) return { persisted: false, storage: 'not-configured', auditId };
    await ensureSchema();
    await db.query(
      `insert into bondr_shadow_execution_packets (id, project_id, packet_hash, payload, observed_at)
       values ($1, $2, $3, $4::jsonb, $5::timestamptz)
       on conflict (id) do update set packet_hash = excluded.packet_hash, payload = excluded.payload`,
      [auditId, packet.projectId, packet.packetHash, JSON.stringify(packet), packet.observedAt]
    );
    return { persisted: true, storage: 'postgres', auditId };
  } catch (error) {
    return { persisted: false, storage: 'error', auditId, error: error instanceof Error ? error.message : 'Shadow audit persistence failed.' };
  }
}

export async function buildShadowExecutionPacket(project: Project, wallets: Wallet[], activation: LiveActivationStatus, input: ShadowPlanInput = {}): Promise<ShadowExecutionPacket> {
  const observedAt = new Date().toISOString();
  const relayReadiness = getJitoRelayReadiness();
  const launch = buildPumpPortalCreatePreview(project, wallets, activation, { mintPublicKey: input.mintPublicKey });
  const signing = buildWalletSigningReadiness(project, wallets, {
    signedWalletIds: asStringArray(input.expectedSigners),
    blockhashExpiresAt: null
  });
  const relayPayload: JitoBundlePayload = {
    signedTransactions: input.signedTransactions,
    expectedSigners: input.expectedSigners,
    expectedMint: input.mintPublicKey ?? project.tokenMint,
    tipLamports: input.tipLamports,
    simulationProof: input.simulationProof,
    approvalId: input.approvalId
  };
  const relay = buildJitoBundlePreview(relayPayload, activation, relayReadiness);
  const sniper = buildSniperTriggerPreview(project, wallets, activation, {
    source: 'manual',
    mint: project.tokenMint ?? input.mintPublicKey,
    connectedSigner: input.connectedSigner,
    amountSol: project.launchConfig?.route.initialBuySol ?? project.fundingPlan.devBuySol,
    slippageBps: project.launchConfig?.route.slippageBps,
    simulationProof: input.simulationProof
  });
  const taskWalletIds = project.launchConfig?.walletPlan.filter((entry) => entry.participate && entry.executionPhase === 'task').map((entry) => entry.walletId) ?? [];
  const task = buildTaskQueuePreview(project, wallets, activation, {
    taskName: 'shadow-launch-task',
    walletIds: taskWalletIds,
    schedule: 'manual',
    maxRuns: 1,
    cooldownSeconds: Math.max(project.launchConfig?.devWalletRules.cooldownSeconds ?? 0, 1),
    riskRuleId: project.launchConfig?.devWalletRules.takeProfitPercents.length ? 'launch-config-risk-rules' : null,
    paused: true
  });
  const recovery = buildExecutionRecoveryReadiness();

  const metadataBlockers = uniq([
    launch.presentInputs.ipfsMetadataUri ? null : 'ipfs-metadata-uri-missing',
    launch.presentInputs.image ? null : 'token-image-missing'
  ]);
  const builderBlockers = launch.blockers.filter((blocker) => !['deployment-gate-closed', 'broadcast-gate-closed'].includes(blocker));
  const signerBlockers = uniq([
    launch.payloadPreview.publicKey && input.connectedSigner && launch.payloadPreview.publicKey !== input.connectedSigner ? 'browser-signer-dev-wallet-mismatch' : null,
    input.connectedSigner ? null : 'browser-signer-proof-required',
    signing.bundleSession.blockers.length ? 'bundle-signing-session-incomplete' : null
  ]);
  const simulationBlockers = activation.requireSimulation && !input.simulationProof ? ['simulation-proof-missing'] : [];
  const relayBlockers = relay.blockers;
  const receiptBlockers = ['durable-receipt-finalizer-not-live'];
  const monitorBlockers = recovery.blockers.includes('durable-monitor-worker-missing') ? ['durable-monitor-worker-missing'] : [];
  const recoveryBlockers = recovery.blockers.filter((blocker) => blocker !== 'durable-monitor-worker-missing');

  const spine: ShadowExecutionPacket['spine'] = [
    stage('metadata', metadataBlockers, 'Token metadata and image must be IPFS-ready before PumpPortal create.'),
    stage('builder', builderBlockers, 'PumpPortal create payload is checked for required create fields.'),
    stage('signer', signerBlockers, 'Browser signer and bundle signing session must match the selected executable wallets.'),
    stage('simulation', simulationBlockers, 'Simulation proof is required before any signature or relay submit.'),
    stage('relay', relayBlockers, 'Jito bundle policy is validated; live relay gates still block submit.', ['jito-relay-disabled', 'broadcast-gate-closed', 'explicit-approval-missing', 'simulation-proof-missing']),
    stage('receipt', receiptBlockers, 'Bundle receipt contract exists; durable finalizer remains shadow-only.'),
    stage('monitor', monitorBlockers, 'Monitoring contract exists; durable worker is still required.'),
    stage('recovery', recoveryBlockers, 'Recovery policy exists and blocks blind retries.'),
    stage('kill-switch', recovery.killSwitch.blocker ? [recovery.killSwitch.blocker] : [], 'HALT file kill switch is checked before future execution.')
  ];

  const readyStages = spine.filter((item) => item.status !== 'blocked').length;
  const hardBlockers = uniq(spine.flatMap((item) => item.status === 'blocked' ? item.blockers : []));
  const warnings = uniq([
    ...launch.warnings,
    ...relay.warnings,
    recovery.killSwitch.active ? 'kill switch active' : null
  ]);
  const packetCore = {
    contract: 'bondr-shadow-execution-packet-v1' as const,
    status: hardBlockers.length ? 'blocked' as const : 'shadow-ready' as const,
    observedAt,
    projectId: project.id,
    completeness: {
      backendScore: Math.round((readyStages / spine.length) * 100),
      shadowExecutableScore: Math.round((spine.filter((item) => item.status === 'ready').length / spine.length) * 100),
      readyStages,
      totalStages: spine.length,
      missingStages: spine.filter((item) => item.status === 'blocked').map((item) => item.step)
    },
    spine,
    launch,
    signing,
    relay,
    sniper,
    task,
    recovery,
    blockers: hardBlockers,
    warnings,
    gates: {
      signingEnabled: activation.signingEnabled,
      broadcastEnabled: activation.broadcastEnabled,
      fundingBroadcastEnabled: activation.fundingBroadcastEnabled,
      deploymentEnabled: activation.deploymentEnabled,
      jitoRelayEnabled: relayReadiness.relayEnabled
    },
    safety: {
      noSigning: true as const,
      noBroadcast: true as const,
      noFunding: true as const,
      noDeployment: true as const,
      noPrivateKeys: true as const,
      shadowMode: true as const
    },
    execution: 'shadow-plan-only-no-signing-no-broadcast' as const
  };
  const packetHash = hashPacket(packetCore);
  const packetWithoutAudit = { ...packetCore, packetHash };
  const audit = await persistPacket(packetWithoutAudit, input.persistAudit);
  return { ...packetWithoutAudit, audit };
}
