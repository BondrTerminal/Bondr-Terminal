import type { PaperFill } from '../execution/paper-fill.js';
import type { TradeEvent } from '../risk/rate-limit.js';
import type { Ledger } from './sqlite-ledger.js';

export type FillMode = 'paper' | 'live';
export type FillSide = 'buy' | 'sell';

export type FillRecord = {
  id: number;
  decisionId: number | null;
  mode: FillMode;
  signature: string | null;
  side: FillSide;
  inputMint: string;
  outputMint: string;
  inputAmountUi: number;
  outputAmountUi: number;
  price: number;
  feeSol: number;
  slippageBps: number | null;
  createdAt: string;
};

export type NewFill = {
  decisionId?: number | null;
  mode: FillMode;
  signature?: string | null;
  side: FillSide;
  inputMint: string;
  outputMint: string;
  inputAmountUi: number;
  outputAmountUi: number;
  price: number;
  feeSol?: number;
  slippageBps?: number | null;
  createdAt?: string;
};

export function insertFill(args: { db: Ledger; fill: NewFill }): number {
  validateFill(args.fill);

  const stmt = args.db.prepare(`
    INSERT INTO fills (
      decision_id, mode, signature, side, input_mint, output_mint,
      input_amount_ui, output_amount_ui, price, fee_sol, slippage_bps, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
  `);

  const result = stmt.run(
    args.fill.decisionId ?? null,
    args.fill.mode,
    args.fill.signature ?? null,
    args.fill.side,
    args.fill.inputMint,
    args.fill.outputMint,
    args.fill.inputAmountUi,
    args.fill.outputAmountUi,
    args.fill.price,
    args.fill.feeSol ?? 0,
    args.fill.slippageBps ?? null,
    args.fill.createdAt ?? null
  );

  return Number(result.lastInsertRowid);
}

export function insertPaperFill(args: {
  db: Ledger;
  fill: PaperFill;
  inputMint: string;
  outputMint: string;
  decisionId?: number | null;
  createdAt?: string;
}): number {
  return insertFill({
    db: args.db,
    fill: {
      decisionId: args.decisionId ?? null,
      mode: 'paper',
      signature: null,
      side: args.fill.side,
      inputMint: args.inputMint,
      outputMint: args.outputMint,
      inputAmountUi: args.fill.inputAmountUi,
      outputAmountUi: args.fill.outputAmountUi,
      price: args.fill.price,
      feeSol: 0,
      slippageBps: args.fill.slippageBps,
      createdAt: args.createdAt
    }
  });
}

export function getFillById(args: { db: Ledger; id: number }): FillRecord | null {
  const row = args.db.prepare('SELECT * FROM fills WHERE id = ?').get(args.id) as FillRow | undefined;
  return row ? mapFillRow(row) : null;
}

export function listRecentFills(args: {
  db: Ledger;
  sinceIso?: string;
  limit?: number;
  mode?: FillMode;
  side?: FillSide;
}): FillRecord[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (args.sinceIso) {
    clauses.push('created_at >= ?');
    params.push(args.sinceIso);
  }
  if (args.mode) {
    clauses.push('mode = ?');
    params.push(args.mode);
  }
  if (args.side) {
    clauses.push('side = ?');
    params.push(args.side);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(args.limit ?? 100, 1000));
  const rows = args.db.prepare(`
    SELECT * FROM fills
    ${where}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(...params, limit) as FillRow[];

  return rows.map(mapFillRow);
}

export function recentFillsAsTradeEvents(args: {
  db: Ledger;
  wallet: string;
  sinceIso?: string;
  limit?: number;
}): TradeEvent[] {
  return listRecentFills({ db: args.db, sinceIso: args.sinceIso, limit: args.limit }).map((fill) => ({
    observedAt: fill.createdAt,
    wallet: args.wallet,
    side: fill.side
  }));
}

function validateFill(fill: NewFill): void {
  if (fill.mode !== 'paper' && fill.mode !== 'live') throw new Error(`invalid fill mode ${fill.mode}`);
  if (fill.side !== 'buy' && fill.side !== 'sell') throw new Error(`invalid fill side ${fill.side}`);
  if (!fill.inputMint) throw new Error('inputMint is required');
  if (!fill.outputMint) throw new Error('outputMint is required');
  assertNonNegativeFinite('inputAmountUi', fill.inputAmountUi);
  assertNonNegativeFinite('outputAmountUi', fill.outputAmountUi);
  assertPositiveFinite('price', fill.price);
  assertNonNegativeFinite('feeSol', fill.feeSol ?? 0);
  if (fill.slippageBps !== undefined && fill.slippageBps !== null) {
    assertNonNegativeFinite('slippageBps', fill.slippageBps);
  }
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive and finite`);
}

function assertNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative and finite`);
}

type FillRow = {
  id: number;
  decision_id: number | null;
  mode: FillMode;
  signature: string | null;
  side: FillSide;
  input_mint: string;
  output_mint: string;
  input_amount_ui: number;
  output_amount_ui: number;
  price: number;
  fee_sol: number;
  slippage_bps: number | null;
  created_at: string;
};

function mapFillRow(row: FillRow): FillRecord {
  return {
    id: row.id,
    decisionId: row.decision_id,
    mode: row.mode,
    signature: row.signature,
    side: row.side,
    inputMint: row.input_mint,
    outputMint: row.output_mint,
    inputAmountUi: row.input_amount_ui,
    outputAmountUi: row.output_amount_ui,
    price: row.price,
    feeSol: row.fee_sol,
    slippageBps: row.slippage_bps,
    createdAt: row.created_at
  };
}
