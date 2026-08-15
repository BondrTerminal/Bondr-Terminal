import { readFileSync } from 'node:fs';
import { PublicKey } from '@solana/web3.js';
import { getMeridianStorePath, type LaunchReceipt, type MeridianStore, type Project } from './meridian-store';
import { getMeridianWalletStore, updateDurableProject, walletStoreMode } from './durable-wallet-store';
import { atomicJsonWrite, mutationMode } from './mutation-safety';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{64,120}$/;

export type LaunchReceiptInput = {
  projectId: string;
  signature: string;
  tokenMint: string;
  pool?: string | null;
  deployer?: string | null;
  route?: string | null;
  provider?: string | null;
  observedAt?: string | null;
  confirmedAt?: string | null;
  intentId?: string | null;
  transactionMessageHash?: string | null;
  simulationStatus?: string | null;
};

function clean(value: string | null | undefined, max = 240) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function optionalAddress(value: string | null | undefined) {
  const cleaned = clean(value, 64);
  if (!cleaned || !ADDRESS_RE.test(cleaned)) return null;
  try {
    return new PublicKey(cleaned).toBase58();
  } catch {
    return null;
  }
}

function validAddress(value: string) {
  if (!ADDRESS_RE.test(value)) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function optionalIso(value: string | null | undefined) {
  const cleaned = clean(value, 80);
  if (!cleaned) return null;
  const timestamp = Date.parse(cleaned);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function normalizeLaunchReceipt(input: LaunchReceiptInput): { receipt?: LaunchReceipt; error?: string } {
  const signature = clean(input.signature, 140);
  const tokenMint = clean(input.tokenMint, 64);
  if (!SIGNATURE_RE.test(signature)) return { error: 'Valid Solana transaction signature is required.' };
  if (!validAddress(tokenMint)) return { error: 'Valid launched token mint is required.' };
  const observedAt = optionalIso(input.observedAt) ?? new Date().toISOString();
  const confirmedAt = optionalIso(input.confirmedAt);
  return {
    receipt: {
      status: confirmedAt ? 'confirmed' : 'sent',
      signature,
      explorerUrl: `https://solscan.io/tx/${signature}`,
      tokenMint,
      pool: optionalAddress(input.pool),
      deployer: optionalAddress(input.deployer),
      route: clean(input.route, 40) || 'pump.fun',
      provider: clean(input.provider, 80) || null,
      observedAt,
      confirmedAt: confirmedAt ?? undefined,
      intentId: clean(input.intentId, 140) || null,
      transactionMessageHash: clean(input.transactionMessageHash, 140) || null,
      simulationStatus: clean(input.simulationStatus, 40) || null
    }
  };
}

export async function persistLaunchReceipt(input: LaunchReceiptInput) {
  if (mutationMode() === 'disabled') return { status: 'blocked' as const, error: 'Mutations are disabled by MUTATIONS_DISABLED=true.' };
  const normalized = normalizeLaunchReceipt(input);
  if (!normalized.receipt) return { status: 'error' as const, error: normalized.error ?? 'Invalid launch receipt.' };

  const mode = walletStoreMode();
  const store = mode === 'postgres' ? await getMeridianWalletStore() : JSON.parse(readFileSync(getMeridianStorePath(), 'utf8')) as MeridianStore;
  const index = store.projects.findIndex((project) => project.id === input.projectId);
  if (index < 0) return { status: 'error' as const, error: 'Project not found.' };

  const current = store.projects[index];
  const receipt = normalized.receipt;
  const next: Project = {
    ...current,
    status: 'deployed',
    tokenMint: receipt.tokenMint,
    pool: receipt.pool ?? current.pool ?? null,
    launchReceipt: receipt,
    deploymentState: {
      stage: 'launched',
      ready: true,
      disabledReason: `Launch broadcast recorded at ${receipt.observedAt}.`
    },
    monitor: {
      ...current.monitor,
      holders: [{ label: 'Unique holders', value: 'refresh', detail: `Load from token ${receipt.tokenMint}` }],
      orders: [{ label: 'Launch tx', value: 'sent', detail: receipt.signature }],
      positions: [{ label: 'Position', value: 'refresh', detail: `Track deployer ${receipt.deployer ?? 'wallet'}` }],
      topTraders: [{ label: 'Top trader', value: 'refresh', detail: 'Awaiting market feed reconciliation' }],
      devTokens: [{ label: 'Dev token', value: receipt.tokenMint, detail: receipt.route }]
    }
  };
  const event: MeridianStore['eventLog'][number] = {
    id: `evt-launch-${Date.now()}`,
    projectId: current.id,
    timestamp: receipt.observedAt,
    level: 'info',
    module: 'deployment',
    message: `Launch broadcast recorded: ${receipt.signature}`
  };

  if (mode === 'postgres') {
    const persisted = await updateDurableProject(next, event);
    if (!persisted) return { status: 'error' as const, error: 'Durable project store is unavailable; launch receipt was not saved.' };
    return { status: 'ok' as const, project: next, receipt, event, persisted: true, mode };
  }

  const dataPath = getMeridianStorePath();
  store.projects[index] = next;
  store.eventLog.unshift(event);
  atomicJsonWrite(dataPath, store);
  return { status: 'ok' as const, project: next, receipt, event, persisted: true, mode: 'local-json' };
}
