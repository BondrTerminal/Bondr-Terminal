import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
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

const PAPER_LEDGER_PATH = process.env.VERCEL
  ? join('/tmp', 'terminal-paper-ledger.json')
  : join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'terminal-paper-ledger.json');
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function emptyStore(): PaperLedgerStore { return { version: 1, entries: [] }; }

function neonConfigured() {
  return Boolean(process.env.NEON_DATA_API_URL?.trim() && process.env.NEON_API_KEY?.trim());
}

function neonTableUrl(path = '') {
  const base = process.env.NEON_DATA_API_URL?.trim()?.replace(/\/$/, '') ?? '';
  return `${base}/terminal_paper_ledger${path}`;
}

async function neonFetch(path: string, init?: RequestInit) {
  const response = await fetch(neonTableUrl(path), {
    ...init,
    headers: {
      apikey: process.env.NEON_API_KEY ?? '',
      authorization: `Bearer ${process.env.NEON_API_KEY ?? ''}`,
      'content-type': 'application/json',
      accept: 'application/json',
      prefer: 'return=representation',
      ...(init?.headers ?? {})
    },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Neon Data API ${response.status} ${response.statusText}`);
  return response.json() as Promise<unknown>;
}

function fromDbRow(row: Record<string, unknown>): PaperLedgerEntry {
  return {
    id: String(row.id),
    createdAt: String(row.created_at ?? row.createdAt),
    updatedAt: String(row.updated_at ?? row.updatedAt),
    mint: String(row.mint),
    side: String(row.side) === 'sell' ? 'sell' : 'buy',
    status: String(row.status) === 'closed' ? 'closed' : 'open',
    amountIn: Number(row.amount_in ?? row.amountIn ?? 0),
    spendAsset: String(row.spend_asset ?? row.spendAsset ?? 'SOL'),
    tokens: Number(row.tokens ?? 0),
    entryPriceUsd: numberOrNull(row.entry_price_usd ?? row.entryPriceUsd),
    exitPriceUsd: numberOrNull(row.exit_price_usd ?? row.exitPriceUsd),
    realizedPnlUsd: numberOrNull(row.realized_pnl_usd ?? row.realizedPnlUsd),
    quote: row.quote ?? null,
    notes: Array.isArray(row.notes) ? row.notes.map(String) : [],
    execution: 'paper-only-no-sign-no-send'
  };
}

function toDbRow(entry: PaperLedgerEntry) {
  return {
    id: entry.id,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    mint: entry.mint,
    side: entry.side,
    status: entry.status,
    amount_in: entry.amountIn,
    spend_asset: entry.spendAsset,
    tokens: entry.tokens,
    entry_price_usd: entry.entryPriceUsd,
    exit_price_usd: entry.exitPriceUsd,
    realized_pnl_usd: entry.realizedPnlUsd,
    quote: entry.quote,
    notes: entry.notes,
    execution: entry.execution
  };
}

export function paperLedgerStorageMetadata() {
  return {
    mode: neonConfigured() ? 'db-neon-data-api' : process.env.VERCEL ? 'serverless-tmp' : 'local-json',
    dbConfigured: neonConfigured(),
    productionDurable: neonConfigured(),
    requiredEnv: ['NEON_DATA_API_URL', 'NEON_API_KEY'],
    requiredTable: 'terminal_paper_ledger',
    note: neonConfigured()
      ? 'Paper ledger uses DB-backed Neon/PostgREST Data API.'
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
  if (!neonConfigured()) return listPaperLedger(filter);
  const params = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: '100' });
  if (filter?.mint) params.set('mint', `eq.${filter.mint}`);
  if (filter?.status && filter.status !== 'all') params.set('status', `eq.${filter.status}`);
  const rows = await neonFetch(`?${params.toString()}`) as Record<string, unknown>[];
  return rows.map(fromDbRow);
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
  if (!neonConfigured()) return createPaperEntry(input);
  const rows = await neonFetch('', { method: 'POST', body: JSON.stringify(toDbRow(entry)) }) as Record<string, unknown>[];
  return rows[0] ? fromDbRow(rows[0]) : entry;
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
  if (!neonConfigured()) return closePaperEntry(id, exitPriceUsd);
  const price = numberOrNull(exitPriceUsd);
  if (price === null) throw new Error('Exit requires numeric exitPriceUsd.');
  const rows = await neonFetch(`?id=eq.${encodeURIComponent(id)}&limit=1`) as Record<string, unknown>[];
  const current = rows[0] ? fromDbRow(rows[0]) : null;
  if (!current) throw new Error('Paper entry not found.');
  if (current.status === 'closed') return current;
  const realizedPnlUsd = current.entryPriceUsd === null ? null : (price - current.entryPriceUsd) * current.tokens;
  const updated: PaperLedgerEntry = { ...current, status: 'closed', updatedAt: new Date().toISOString(), exitPriceUsd: price, realizedPnlUsd, notes: [...current.notes, 'Paper exit recorded. No transaction was built, signed, or broadcast.'] };
  const patched = await neonFetch(`?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(toDbRow(updated)) }) as Record<string, unknown>[];
  return patched[0] ? fromDbRow(patched[0]) : updated;
}
