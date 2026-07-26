import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { atomicJsonWrite } from './mutation-safety';

export type PaperLedgerSide = 'buy' | 'sell';
export type PaperLedgerStatus = 'open' | 'closed';

export type PaperLedgerEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  mint: string;
  side: PaperLedgerSide;
  status: PaperLedgerStatus;
  amountIn: number;
  spendAsset: string;
  tokens: number;
  entryPriceUsd: number | null;
  exitPriceUsd: number | null;
  realizedPnlUsd: number | null;
  quote: unknown;
  notes: string[];
  execution: 'paper-only-no-sign-no-send';
};

type PaperLedgerStore = { version: 1; entries: PaperLedgerEntry[] };
type DbPaperLedgerRow = {
  id: string;
  created_at: string | Date;
  updated_at: string | Date;
  mint: string;
  side: string;
  status: string;
  amount_in: string | number;
  spend_asset: string;
  tokens: string | number;
  entry_price_usd: string | number | null;
  exit_price_usd: string | number | null;
  realized_pnl_usd: string | number | null;
  quote: unknown;
  notes: unknown;
  execution: string;
};

const PAPER_LEDGER_PATH = process.env.VERCEL
  ? join('/tmp', 'terminal-paper-ledger.json')
  : join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'terminal-paper-ledger.json');
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const globalForPaperLedger = globalThis as typeof globalThis & { __meridianPaperLedgerPool?: Pool; __meridianPaperLedgerSchemaReady?: Promise<void> };

function emptyStore(): PaperLedgerStore { return { version: 1, entries: [] }; }

function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function paperLedgerPool() {
  if (!databaseConfigured()) return null;
  if (!globalForPaperLedger.__meridianPaperLedgerPool) {
    globalForPaperLedger.__meridianPaperLedgerPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false }
    });
  }
  return globalForPaperLedger.__meridianPaperLedgerPool;
}

async function ensurePaperLedgerSchema() {
  const pool = paperLedgerPool();
  if (!pool) return;
  if (!globalForPaperLedger.__meridianPaperLedgerSchemaReady) {
    globalForPaperLedger.__meridianPaperLedgerSchemaReady = pool.query(`
      create table if not exists terminal_paper_ledger (
        id text primary key,
        created_at timestamptz not null,
        updated_at timestamptz not null,
        mint text not null,
        side text not null check (side in ('buy', 'sell')),
        status text not null check (status in ('open', 'closed')),
        amount_in numeric not null,
        spend_asset text not null,
        tokens numeric not null,
        entry_price_usd numeric,
        exit_price_usd numeric,
        realized_pnl_usd numeric,
        quote jsonb,
        notes jsonb not null default '[]'::jsonb,
        execution text not null default 'paper-only-no-sign-no-send'
      );
      create index if not exists terminal_paper_ledger_mint_created_idx
        on terminal_paper_ledger (mint, created_at desc);
      create index if not exists terminal_paper_ledger_status_idx
        on terminal_paper_ledger (status);
    `).then(() => undefined);
  }
  await globalForPaperLedger.__meridianPaperLedgerSchemaReady;
}

function fromDbRow(row: DbPaperLedgerRow): PaperLedgerEntry {
  return {
    id: String(row.id),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    mint: String(row.mint),
    side: String(row.side) === 'sell' ? 'sell' : 'buy',
    status: String(row.status) === 'closed' ? 'closed' : 'open',
    amountIn: Number(row.amount_in ?? 0),
    spendAsset: String(row.spend_asset ?? 'SOL'),
    tokens: Number(row.tokens ?? 0),
    entryPriceUsd: numberOrNull(row.entry_price_usd),
    exitPriceUsd: numberOrNull(row.exit_price_usd),
    realizedPnlUsd: numberOrNull(row.realized_pnl_usd),
    quote: row.quote ?? null,
    notes: Array.isArray(row.notes) ? row.notes.map(String) : [],
    execution: 'paper-only-no-sign-no-send'
  };
}

export function paperLedgerStorageMetadata() {
  return {
    mode: databaseConfigured() ? 'db-neon-postgres' : process.env.VERCEL ? 'serverless-tmp' : 'local-json',
    dbConfigured: databaseConfigured(),
    productionDurable: databaseConfigured(),
    requiredEnv: ['DATABASE_URL'],
    requiredTable: 'terminal_paper_ledger',
    note: databaseConfigured()
      ? 'Paper ledger uses Neon/Postgres DATABASE_URL with server-side SQL only.'
      : process.env.VERCEL
        ? 'Paper ledger is using serverless /tmp fallback; it is not durable across cold starts/deploys.'
        : 'Paper ledger is using local JSON for development.'
  };
}

function readStore(): PaperLedgerStore {
  if (!existsSync(PAPER_LEDGER_PATH)) return emptyStore();
  return JSON.parse(readFileSync(PAPER_LEDGER_PATH, 'utf8')) as PaperLedgerStore;
}

function writeStore(store: PaperLedgerStore) {
  mkdirSync(dirname(PAPER_LEDGER_PATH), { recursive: true });
  atomicJsonWrite(PAPER_LEDGER_PATH, store);
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function quoteObject(quote: unknown): Record<string, unknown> {
  return quote && typeof quote === 'object' && !Array.isArray(quote) ? quote as Record<string, unknown> : {};
}

function deriveEntry(input: { mint: string; side?: string; amountIn?: unknown; spendAsset?: string; quote?: unknown; priceUsd?: unknown }): PaperLedgerEntry {
  const mint = input.mint.trim();
  if (!MINT_RE.test(mint)) throw new Error('Missing or invalid mint.');
  const side: PaperLedgerSide = String(input.side ?? 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy';
  const quote = quoteObject(input.quote);
  const quotePayload = quoteObject(quote.quote ?? quote);
  const request = quoteObject(quote.request);
  const amountIn = numberOrNull(input.amountIn) ?? numberOrNull(request.amount) ?? 0;
  if (!amountIn || amountIn <= 0) throw new Error('Paper entry requires a positive amount.');
  const outAmountRaw = numberOrNull(quotePayload.outAmount);
  const tokens = side === 'buy' ? (outAmountRaw ?? 0) : amountIn;
  const entryPriceUsd = numberOrNull(input.priceUsd) ?? numberOrNull(quotePayload.priceUsd) ?? null;
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    mint,
    side,
    status: 'open',
    amountIn,
    spendAsset: input.spendAsset ?? String(request.spendAsset ?? 'SOL'),
    tokens,
    entryPriceUsd,
    exitPriceUsd: null,
    realizedPnlUsd: null,
    quote,
    notes: ['Paper entry only. No transaction was built, signed, or broadcast.'],
    execution: 'paper-only-no-sign-no-send'
  };
}

export function paperLedgerPath() { return PAPER_LEDGER_PATH; }

export function listPaperLedger(filter?: { mint?: string | null; status?: PaperLedgerStatus | 'all' | null }) {
  const entries = readStore().entries;
  return entries.filter((entry) => {
    if (filter?.mint && entry.mint !== filter.mint) return false;
    if (filter?.status && filter.status !== 'all' && entry.status !== filter.status) return false;
    return true;
  });
}

export async function listPaperLedgerAsync(filter?: { mint?: string | null; status?: PaperLedgerStatus | 'all' | null }) {
  const pool = paperLedgerPool();
  if (!pool) return listPaperLedger(filter);
  await ensurePaperLedgerSchema();
  const where: string[] = [];
  const values: unknown[] = [];
  if (filter?.mint) { values.push(filter.mint); where.push(`mint = $${values.length}`); }
  if (filter?.status && filter.status !== 'all') { values.push(filter.status); where.push(`status = $${values.length}`); }
  const query = `select * from terminal_paper_ledger${where.length ? ` where ${where.join(' and ')}` : ''} order by created_at desc limit 100`;
  const result = await pool.query<DbPaperLedgerRow>(query, values);
  return result.rows.map(fromDbRow);
}

export function summarizePaperLedger(mint?: string | null, currentPriceUsd?: number | null) {
  const entries = listPaperLedger({ mint, status: 'all' });
  return summarizeEntries(entries, currentPriceUsd);
}

function summarizeEntries(entries: PaperLedgerEntry[], currentPriceUsd?: number | null) {
  const open = entries.filter((entry) => entry.status === 'open');
  const closed = entries.filter((entry) => entry.status === 'closed');
  const realizedPnlUsd = closed.reduce((sum, entry) => sum + (entry.realizedPnlUsd ?? 0), 0);
  const unrealizedPnlUsd = currentPriceUsd === null || currentPriceUsd === undefined ? null : open.reduce((sum, entry) => {
    if (entry.entryPriceUsd === null || !entry.tokens) return sum;
    return sum + ((currentPriceUsd - entry.entryPriceUsd) * entry.tokens);
  }, 0);
  return {
    entryCount: entries.length,
    openCount: open.length,
    closedCount: closed.length,
    realizedPnlUsd,
    unrealizedPnlUsd,
    totalPnlUsd: unrealizedPnlUsd === null ? realizedPnlUsd : realizedPnlUsd + unrealizedPnlUsd,
    execution: 'paper-only-no-sign-no-send' as const
  };
}

export async function summarizePaperLedgerAsync(mint?: string | null, currentPriceUsd?: number | null) {
  return summarizeEntries(await listPaperLedgerAsync({ mint, status: 'all' }), currentPriceUsd);
}

export function createPaperEntry(input: { mint: string; side?: string; amountIn?: unknown; spendAsset?: string; quote?: unknown; priceUsd?: unknown }) {
  const entry = deriveEntry(input);
  const store = readStore();
  store.entries.unshift(entry);
  writeStore(store);
  return entry;
}

export async function createPaperEntryAsync(input: { mint: string; side?: string; amountIn?: unknown; spendAsset?: string; quote?: unknown; priceUsd?: unknown }) {
  const entry = deriveEntry(input);
  const pool = paperLedgerPool();
  if (!pool) return createPaperEntry(input);
  await ensurePaperLedgerSchema();
  const result = await pool.query<DbPaperLedgerRow>(`
    insert into terminal_paper_ledger
      (id, created_at, updated_at, mint, side, status, amount_in, spend_asset, tokens, entry_price_usd, exit_price_usd, realized_pnl_usd, quote, notes, execution)
    values
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15)
    returning *
  `, [entry.id, entry.createdAt, entry.updatedAt, entry.mint, entry.side, entry.status, entry.amountIn, entry.spendAsset, entry.tokens, entry.entryPriceUsd, entry.exitPriceUsd, entry.realizedPnlUsd, JSON.stringify(entry.quote), JSON.stringify(entry.notes), entry.execution]);
  return result.rows[0] ? fromDbRow(result.rows[0]) : entry;
}

export function closePaperEntry(id: string, exitPriceUsd: unknown) {
  const price = numberOrNull(exitPriceUsd);
  if (price === null) throw new Error('Exit requires numeric exitPriceUsd.');
  const store = readStore();
  const index = store.entries.findIndex((entry) => entry.id === id);
  if (index === -1) throw new Error('Paper entry not found.');
  const current = store.entries[index];
  if (current.status === 'closed') return current;
  const realizedPnlUsd = current.entryPriceUsd === null ? null : (price - current.entryPriceUsd) * current.tokens;
  const updated: PaperLedgerEntry = { ...current, status: 'closed', updatedAt: new Date().toISOString(), exitPriceUsd: price, realizedPnlUsd, notes: [...current.notes, 'Paper exit recorded. No transaction was built, signed, or broadcast.'] };
  store.entries[index] = updated;
  writeStore(store);
  return updated;
}

export async function closePaperEntryAsync(id: string, exitPriceUsd: unknown) {
  const pool = paperLedgerPool();
  if (!pool) return closePaperEntry(id, exitPriceUsd);
  const price = numberOrNull(exitPriceUsd);
  if (price === null) throw new Error('Exit requires numeric exitPriceUsd.');
  await ensurePaperLedgerSchema();
  const currentResult = await pool.query<DbPaperLedgerRow>('select * from terminal_paper_ledger where id = $1 limit 1', [id]);
  const current = currentResult.rows[0] ? fromDbRow(currentResult.rows[0]) : null;
  if (!current) throw new Error('Paper entry not found.');
  if (current.status === 'closed') return current;
  const realizedPnlUsd = current.entryPriceUsd === null ? null : (price - current.entryPriceUsd) * current.tokens;
  const updated: PaperLedgerEntry = { ...current, status: 'closed', updatedAt: new Date().toISOString(), exitPriceUsd: price, realizedPnlUsd, notes: [...current.notes, 'Paper exit recorded. No transaction was built, signed, or broadcast.'] };
  const patched = await pool.query<DbPaperLedgerRow>(`
    update terminal_paper_ledger
    set status = $2, updated_at = $3, exit_price_usd = $4, realized_pnl_usd = $5, notes = $6::jsonb
    where id = $1
    returning *
  `, [updated.id, updated.status, updated.updatedAt, updated.exitPriceUsd, updated.realizedPnlUsd, JSON.stringify(updated.notes)]);
  return patched.rows[0] ? fromDbRow(patched.rows[0]) : updated;
}
