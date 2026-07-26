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

export function summarizePaperLedger(mint?: string | null, currentPriceUsd?: number | null) {
  const entries = listPaperLedger({ mint, status: 'all' });
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

export function createPaperEntry(input: { mint: string; side?: string; amountIn?: unknown; spendAsset?: string; quote?: unknown; priceUsd?: unknown }) {
  const entry = deriveEntry(input);
  const store = readStore();
  store.entries.unshift(entry);
  writeStore(store);
  return entry;
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
