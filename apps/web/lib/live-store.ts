import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { meridianAuthConfig } from './meridian-auth';
import { atomicJsonWrite, mutationMeta } from './mutation-safety';

export type LiveStoreMode = 'local-json' | 'neon-postgres' | 'disabled';

export const DURABLE_LIVE_STORE_ADAPTER_IMPLEMENTED = true;
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

export type TerminalOrderRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  payload: Record<string, unknown>;
};

type LiveStore = {
  version: 1;
  intents: TerminalIntent[];
  audit: MutationAuditEntry[];
  orders?: TerminalOrderRow[];
};

type DbIntentRow = {
  id: string;
  created_at: string | Date;
  updated_at: string | Date;
  expires_at: string | Date;
  status: TerminalIntentStatus;
  expected_signer: string;
  expected_mint: string;
  expected_side: 'buy' | 'sell';
  expected_amount: string | null;
  slippage_bps: number | null;
  allowed_programs: unknown;
  required_accounts: unknown;
  source_route: string;
  order_id: string | null;
  bundle_id: string | null;
  quote_hash: string | null;
  route_hash: string | null;
  transaction_message_hash: string | null;
  note: string | null;
};

type DbAuditRow = {
  id: string;
  route: string;
  action: string;
  actor: string;
  observed_at: string | Date;
  status: string;
  request_fingerprint: string;
  note: string | null;
};

type DbOrderRow = {
  id: string;
  created_at: string | Date;
  updated_at: string | Date;
  status: string;
  payload: unknown;
};

const LIVE_STORE_PATH = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'terminal-live-store.json');
const globalForLiveStore = globalThis as typeof globalThis & { __meridianLiveStoreSchemaReady?: Promise<void> };

function dbUrl() { return process.env.LIVE_STORE_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || ''; }
function databaseConfigured() { return Boolean(dbUrl()); }
function operatorAuthConfigured() {
  return Boolean(
    meridianAuthConfig().configured ||
    process.env.OPERATOR_AUTH_ENABLED === 'true' ||
    process.env.TERMINAL_OPERATOR_TOKEN?.trim() ||
    process.env.OPERATOR_SESSION_SECRET?.trim()
  );
}
function liveSql() { const url = dbUrl(); return url ? neon(url) : null; }

export function liveStoreMode(): LiveStoreMode {
  if (process.env.MUTATIONS_DISABLED === 'true') return 'disabled';
  if (databaseConfigured()) return 'neon-postgres';
  return 'local-json';
}

export function liveStoreMetadata(note?: string) {
  const mode = liveStoreMode();
  const durableConfigured = databaseConfigured();
  const authConfigured = operatorAuthConfigured();
  const productionReady = mode === 'neon-postgres' && durableConfigured && DURABLE_LIVE_STORE_ADAPTER_IMPLEMENTED && authConfigured;
  return {
    storageMode: mode,
    durableConfigured,
    durableAdapterImplemented: DURABLE_LIVE_STORE_ADAPTER_IMPLEMENTED,
    productionReady,
    requiresAuth: true,
    authConfigured,
    authMode: authConfigured ? 'operator-auth-configured' : 'operator-auth-required',
    auditLogged: mode !== 'disabled',
    requiredProductionCapabilities: ['durable orders', 'durable transaction intents', 'durable mutation audit logs', 'operator authentication', 'concurrency-safe writes'],
    note: note ?? (productionReady
      ? 'Durable Neon/Postgres live store adapter and operator auth are configured.'
      : mode === 'neon-postgres'
        ? 'Durable Neon/Postgres live store adapter is configured, but productionReady remains false until operator auth is configured.'
        : 'Using local JSON live store for development only; production live mode requires durable DB storage plus operator auth.')
  };
}

function emptyStore(): LiveStore { return { version: 1, intents: [], audit: [], orders: [] }; }

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

function iso(value: string | Date) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function stringArray(value: unknown) { return Array.isArray(value) ? value.map(String) : []; }
function jsonObject(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

function mapIntent(row: DbIntentRow): TerminalIntent {
  return {
    id: row.id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    expiresAt: iso(row.expires_at),
    status: row.status,
    expectedSigner: row.expected_signer,
    expectedMint: row.expected_mint,
    expectedSide: row.expected_side,
    expectedAmount: row.expected_amount,
    slippageBps: row.slippage_bps,
    allowedPrograms: stringArray(row.allowed_programs),
    requiredAccounts: stringArray(row.required_accounts),
    sourceRoute: row.source_route,
    orderId: row.order_id,
    bundleId: row.bundle_id,
    quoteHash: row.quote_hash,
    routeHash: row.route_hash,
    transactionMessageHash: row.transaction_message_hash,
    note: row.note
  };
}

function mapAudit(row: DbAuditRow): MutationAuditEntry {
  return { id: row.id, route: row.route, action: row.action, actor: row.actor, observedAt: iso(row.observed_at), status: row.status, requestFingerprint: row.request_fingerprint, note: row.note };
}

function mapOrder(row: DbOrderRow): TerminalOrderRow {
  return { id: row.id, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), status: row.status, payload: jsonObject(row.payload) };
}

async function ensureLiveStoreSchema() {
  const sql = liveSql();
  if (!sql) return;
  if (!globalForLiveStore.__meridianLiveStoreSchemaReady) {
    globalForLiveStore.__meridianLiveStoreSchemaReady = (async () => {
      await sql.query(`create table if not exists terminal_orders (id text primary key, created_at timestamptz not null, updated_at timestamptz not null, status text not null, payload jsonb not null)`);
      await sql.query(`create index if not exists terminal_orders_status_idx on terminal_orders (status)`);
      await sql.query(`create index if not exists terminal_orders_created_at_idx on terminal_orders (created_at desc)`);
      await sql.query(`create table if not exists terminal_transaction_intents (id text primary key, created_at timestamptz not null, updated_at timestamptz not null, expires_at timestamptz not null, status text not null, expected_signer text not null, expected_mint text not null, expected_side text not null, expected_amount text, slippage_bps integer, allowed_programs jsonb not null default '[]'::jsonb, required_accounts jsonb not null default '[]'::jsonb, source_route text not null, order_id text, bundle_id text, quote_hash text, route_hash text, transaction_message_hash text, note text)`);
      await sql.query(`create index if not exists terminal_transaction_intents_status_idx on terminal_transaction_intents (status)`);
      await sql.query(`create index if not exists terminal_transaction_intents_expires_at_idx on terminal_transaction_intents (expires_at)`);
      await sql.query(`create index if not exists terminal_transaction_intents_order_id_idx on terminal_transaction_intents (order_id)`);
      await sql.query(`create table if not exists terminal_mutation_audit_logs (id text primary key, route text not null, action text not null, actor text not null, observed_at timestamptz not null, status text not null, request_fingerprint text not null, note text)`);
      await sql.query(`create index if not exists terminal_mutation_audit_logs_observed_at_idx on terminal_mutation_audit_logs (observed_at desc)`);
      await sql.query(`create index if not exists terminal_mutation_audit_logs_route_idx on terminal_mutation_audit_logs (route)`);
    })();
  }
  await globalForLiveStore.__meridianLiveStoreSchemaReady;
}

export async function ensureLiveStoreSchemaReady() { await ensureLiveStoreSchema(); }

export function listIntents(filter?: { id?: string | null; status?: TerminalIntentStatus | 'all' | null }) {
  const now = Date.now();
  return readStore().intents.map((intent) => intent.status !== 'expired' && Date.parse(intent.expiresAt) <= now ? { ...intent, status: 'expired' as const } : intent)
    .filter((intent) => {
      if (filter?.id && intent.id !== filter.id) return false;
      if (filter?.status && filter.status !== 'all' && intent.status !== filter.status) return false;
      return true;
    });
}

export async function listIntentsAsync(filter?: { id?: string | null; status?: TerminalIntentStatus | 'all' | null }) {
  const sql = liveSql();
  if (!sql || liveStoreMode() !== 'neon-postgres') return listIntents(filter);
  await ensureLiveStoreSchema();
  const rows = filter?.id
    ? await sql`select * from terminal_transaction_intents where id = ${filter.id} order by created_at desc limit 100`
    : filter?.status && filter.status !== 'all'
      ? await sql`select * from terminal_transaction_intents where status = ${filter.status} order by created_at desc limit 100`
      : await sql`select * from terminal_transaction_intents order by created_at desc limit 100`;
  const now = Date.now();
  return (rows as DbIntentRow[]).map(mapIntent).map((intent) => intent.status !== 'expired' && Date.parse(intent.expiresAt) <= now ? { ...intent, status: 'expired' as const } : intent);
}

export function getIntent(id: string) {
  return listIntents({ id, status: 'all' })[0] ?? null;
}

export async function getIntentAsync(id: string) {
  return (await listIntentsAsync({ id, status: 'all' }))[0] ?? null;
}

export function createIntent(input: Omit<TerminalIntent, 'id' | 'createdAt' | 'updatedAt' | 'expiresAt' | 'status'> & Partial<Pick<TerminalIntent, 'id' | 'expiresAt' | 'status'>>) {
  const now = new Date().toISOString();
  const intent: TerminalIntent = { ...input, id: input.id ?? randomUUID(), createdAt: now, updatedAt: now, expiresAt: input.expiresAt ?? new Date(Date.now() + 10 * 60_000).toISOString(), status: input.status ?? 'created' };
  const store = readStore();
  store.intents.unshift(intent);
  writeStore(store);
  return intent;
}

export async function createIntentAsync(input: Parameters<typeof createIntent>[0]) {
  const sql = liveSql();
  if (!sql || liveStoreMode() !== 'neon-postgres') return createIntent(input);
  await ensureLiveStoreSchema();
  const now = new Date().toISOString();
  const intent: TerminalIntent = { ...input, id: input.id ?? randomUUID(), createdAt: now, updatedAt: now, expiresAt: input.expiresAt ?? new Date(Date.now() + 10 * 60_000).toISOString(), status: input.status ?? 'created' };
  await sql`insert into terminal_transaction_intents (id, created_at, updated_at, expires_at, status, expected_signer, expected_mint, expected_side, expected_amount, slippage_bps, allowed_programs, required_accounts, source_route, order_id, bundle_id, quote_hash, route_hash, transaction_message_hash, note) values (${intent.id}, ${intent.createdAt}, ${intent.updatedAt}, ${intent.expiresAt}, ${intent.status}, ${intent.expectedSigner}, ${intent.expectedMint}, ${intent.expectedSide}, ${intent.expectedAmount}, ${intent.slippageBps}, ${JSON.stringify(intent.allowedPrograms)}::jsonb, ${JSON.stringify(intent.requiredAccounts)}::jsonb, ${intent.sourceRoute}, ${intent.orderId}, ${intent.bundleId}, ${intent.quoteHash}, ${intent.routeHash}, ${intent.transactionMessageHash}, ${intent.note})`;
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
  if (patch.status && !canTransitionIntent(current.status, patch.status)) throw new Error(`Invalid intent status transition: ${current.status} -> ${patch.status}.`);
  store.intents[index] = { ...current, ...patch, updatedAt: new Date().toISOString() };
  writeStore(store);
  return store.intents[index];
}

export async function updateIntentAsync(id: string, patch: Partial<TerminalIntent>) {
  const sql = liveSql();
  if (!sql || liveStoreMode() !== 'neon-postgres') return updateIntent(id, patch);
  await ensureLiveStoreSchema();
  const current = await getIntentAsync(id);
  if (!current) return null;
  if (patch.status && !canTransitionIntent(current.status, patch.status)) throw new Error(`Invalid intent status transition: ${current.status} -> ${patch.status}.`);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await sql`update terminal_transaction_intents set updated_at=${next.updatedAt}, expires_at=${next.expiresAt}, status=${next.status}, expected_signer=${next.expectedSigner}, expected_mint=${next.expectedMint}, expected_side=${next.expectedSide}, expected_amount=${next.expectedAmount}, slippage_bps=${next.slippageBps}, allowed_programs=${JSON.stringify(next.allowedPrograms)}::jsonb, required_accounts=${JSON.stringify(next.requiredAccounts)}::jsonb, source_route=${next.sourceRoute}, order_id=${next.orderId}, bundle_id=${next.bundleId}, quote_hash=${next.quoteHash}, route_hash=${next.routeHash}, transaction_message_hash=${next.transactionMessageHash}, note=${next.note} where id=${id}`;
  return next;
}

export function auditMutation(entry: Omit<MutationAuditEntry, 'id' | 'observedAt'>) {
  const store = readStore();
  const row: MutationAuditEntry = { ...entry, id: randomUUID(), observedAt: new Date().toISOString() };
  store.audit.unshift(row);
  store.audit = store.audit.slice(0, 500);
  writeStore(store);
  return row;
}

export async function auditMutationAsync(entry: Omit<MutationAuditEntry, 'id' | 'observedAt'>) {
  const sql = liveSql();
  if (!sql || liveStoreMode() !== 'neon-postgres') return auditMutation(entry);
  await ensureLiveStoreSchema();
  const row: MutationAuditEntry = { ...entry, id: randomUUID(), observedAt: new Date().toISOString() };
  await sql`insert into terminal_mutation_audit_logs (id, route, action, actor, observed_at, status, request_fingerprint, note) values (${row.id}, ${row.route}, ${row.action}, ${row.actor}, ${row.observedAt}, ${row.status}, ${row.requestFingerprint}, ${row.note})`;
  return row;
}

export async function listAuditLogsAsync(limit = 100) {
  const sql = liveSql();
  if (!sql || liveStoreMode() !== 'neon-postgres') return readStore().audit.slice(0, limit);
  await ensureLiveStoreSchema();
  const rows = await sql`select * from terminal_mutation_audit_logs order by observed_at desc limit ${limit}`;
  return (rows as DbAuditRow[]).map(mapAudit);
}

export async function upsertTerminalOrderAsync(order: TerminalOrderRow) {
  const sql = liveSql();
  if (!sql || liveStoreMode() !== 'neon-postgres') {
    const store = readStore();
    const orders = store.orders ?? [];
    const idx = orders.findIndex((row) => row.id === order.id);
    if (idx >= 0) orders[idx] = order; else orders.unshift(order);
    store.orders = orders.slice(0, 500);
    writeStore(store);
    return order;
  }
  await ensureLiveStoreSchema();
  await sql`insert into terminal_orders (id, created_at, updated_at, status, payload) values (${order.id}, ${order.createdAt}, ${order.updatedAt}, ${order.status}, ${JSON.stringify(order.payload)}::jsonb) on conflict (id) do update set updated_at=excluded.updated_at, status=excluded.status, payload=excluded.payload`;
  return order;
}

export async function listTerminalOrdersAsync(filter?: { status?: string | 'all' | null; limit?: number }) {
  const sql = liveSql();
  const limit = Math.max(1, Math.min(Number(filter?.limit ?? 100), 500));
  if (!sql || liveStoreMode() !== 'neon-postgres') {
    const rows = readStore().orders ?? [];
    return rows.filter((row) => !filter?.status || filter.status === 'all' || row.status === filter.status).slice(0, limit);
  }
  await ensureLiveStoreSchema();
  const rows = filter?.status && filter.status !== 'all'
    ? await sql`select * from terminal_orders where status = ${filter.status} order by created_at desc limit ${limit}`
    : await sql`select * from terminal_orders order by created_at desc limit ${limit}`;
  return (rows as DbOrderRow[]).map(mapOrder);
}

export function liveMutationMeta(note?: string) {
  return { ...mutationMeta(note), ...liveStoreMetadata(note) };
}
