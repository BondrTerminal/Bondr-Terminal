import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { atomicJsonWrite, mutationMeta } from './mutation-safety';

export type LiveStoreMode = 'local-json' | 'durable-db-required' | 'disabled';

export const DURABLE_LIVE_STORE_ADAPTER_IMPLEMENTED = false;
export type TerminalIntentStatus = 'created' | 'transaction_built' | 'signed_client_side' | 'broadcast_requested' | 'broadcast_blocked' | 'broadcast_sent' | 'confirmed' | 'failed' | 'expired';

export type TerminalIntent = {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  status: TerminalIntentStatus;
  expectedSigner: string;
  expectedMint: string;
  expectedSide: 'buy' | 'sell';
  expectedAmount: string | null;
  slippageBps: number | null;
  allowedPrograms: string[];
  requiredAccounts: string[];
  sourceRoute: string;
  orderId: string | null;
  bundleId: string | null;
  quoteHash: string | null;
  routeHash: string | null;
  transactionMessageHash: string | null;
  note: string | null;
};

export type MutationAuditEntry = {
  id: string;
  route: string;
  action: string;
  actor: string;
  observedAt: string;
  status: string;
  requestFingerprint: string;
  note: string | null;
};

type LiveStore = {
  version: 1;
  intents: TerminalIntent[];
  audit: MutationAuditEntry[];
};

const LIVE_STORE_PATH = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'terminal-live-store.json');

export function liveStoreMode(): LiveStoreMode {
  if (process.env.MUTATIONS_DISABLED === 'true') return 'disabled';
  return 'local-json';
}

export function liveStoreMetadata(note?: string) {
  const mode = liveStoreMode();
  const durableConfigured = Boolean(process.env.DATABASE_URL || process.env.LIVE_STORE_DATABASE_URL);
  const productionReady = durableConfigured && DURABLE_LIVE_STORE_ADAPTER_IMPLEMENTED;
  return {
    storageMode: mode,
    durableConfigured,
    durableAdapterImplemented: DURABLE_LIVE_STORE_ADAPTER_IMPLEMENTED,
    productionReady,
    requiresAuth: true,
    authMode: productionReady ? 'external-required' : 'local-dev-only',
    auditLogged: mode !== 'disabled',
    requiredProductionCapabilities: ['durable orders', 'durable transaction intents', 'durable mutation audit logs', 'operator authentication', 'concurrency-safe writes'],
    note: note ?? (productionReady ? 'Durable authenticated live store adapter is configured.' : 'Using local JSON live store for development only; DATABASE_URL alone is not production-ready without an implemented durable adapter and operator auth.')
  };
}

function emptyStore(): LiveStore { return { version: 1, intents: [], audit: [] }; }

export function liveStorePath() { return LIVE_STORE_PATH; }

function readStore(): LiveStore {
  if (!existsSync(LIVE_STORE_PATH)) return emptyStore();
  return JSON.parse(readFileSync(LIVE_STORE_PATH, 'utf8')) as LiveStore;
}

function writeStore(store: LiveStore) {
  mkdirSync(dirname(LIVE_STORE_PATH), { recursive: true });
  atomicJsonWrite(LIVE_STORE_PATH, store);
}

export function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function hashBase64Transaction(base64: string) {
  return createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex');
}

export function listIntents(filter?: { id?: string | null; status?: TerminalIntentStatus | 'all' | null }) {
  const now = Date.now();
  return readStore().intents.map((intent) => intent.status !== 'expired' && Date.parse(intent.expiresAt) <= now ? { ...intent, status: 'expired' as const } : intent)
    .filter((intent) => {
      if (filter?.id && intent.id !== filter.id) return false;
      if (filter?.status && filter.status !== 'all' && intent.status !== filter.status) return false;
      return true;
    });
}

export function getIntent(id: string) {
  return listIntents({ id, status: 'all' })[0] ?? null;
}

export function createIntent(input: Omit<TerminalIntent, 'id' | 'createdAt' | 'updatedAt' | 'expiresAt' | 'status'> & Partial<Pick<TerminalIntent, 'id' | 'expiresAt' | 'status'>>) {
  const now = new Date().toISOString();
  const intent: TerminalIntent = {
    ...input,
    id: input.id ?? randomUUID(),
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 10 * 60_000).toISOString(),
    status: input.status ?? 'created'
  };
  const store = readStore();
  store.intents.unshift(intent);
  writeStore(store);
  return intent;
}

const ALLOWED_INTENT_TRANSITIONS: Record<TerminalIntentStatus, TerminalIntentStatus[]> = {
  created: ['transaction_built', 'expired', 'failed'],
  transaction_built: ['signed_client_side', 'broadcast_requested', 'broadcast_blocked', 'expired', 'failed'],
  signed_client_side: ['broadcast_requested', 'broadcast_blocked', 'expired', 'failed'],
  broadcast_requested: ['broadcast_sent', 'broadcast_blocked', 'failed'],
  broadcast_blocked: ['transaction_built', 'signed_client_side', 'expired', 'failed'],
  broadcast_sent: ['confirmed', 'failed'],
  confirmed: [],
  failed: [],
  expired: []
};

export function canTransitionIntent(from: TerminalIntentStatus, to: TerminalIntentStatus) {
  return from === to || ALLOWED_INTENT_TRANSITIONS[from]?.includes(to) === true;
}

export function updateIntent(id: string, patch: Partial<TerminalIntent>) {
  const store = readStore();
  const index = store.intents.findIndex((intent) => intent.id === id);
  if (index === -1) return null;
  const current = store.intents[index];
  if (patch.status && !canTransitionIntent(current.status, patch.status)) {
    throw new Error(`Invalid intent status transition: ${current.status} -> ${patch.status}.`);
  }
  store.intents[index] = { ...current, ...patch, updatedAt: new Date().toISOString() };
  writeStore(store);
  return store.intents[index];
}

export function auditMutation(entry: Omit<MutationAuditEntry, 'id' | 'observedAt'>) {
  const store = readStore();
  const row: MutationAuditEntry = { ...entry, id: randomUUID(), observedAt: new Date().toISOString() };
  store.audit.unshift(row);
  store.audit = store.audit.slice(0, 500);
  writeStore(store);
  return row;
}

export function liveMutationMeta(note?: string) {
  return { ...mutationMeta(note), ...liveStoreMetadata(note) };
}
