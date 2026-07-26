import fs from 'node:fs';
import Database from 'better-sqlite3';
import type { Decision, MarketSnapshot, WalletSnapshot } from '../types/decision.js';
import type { PaperOrder } from '../execution/order-lifecycle.js';

export type Ledger = Database.Database;

export function openLedger(path = process.env.LEDGER_DB_PATH ?? './market-maker.sqlite3'): Ledger {
  const db = new Database(path);
  const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  db.exec(schema);
  return db;
}

export function insertDecision(args: {
  db: Ledger;
  market: MarketSnapshot;
  wallet: WalletSnapshot;
  decision: Decision;
}): number {
  const stmt = args.db.prepare(`
    INSERT INTO decisions (
      observed_at, wallet_name, wallet_pubkey, side, size_sol, reason,
      risk_passed, risk_reasons_json, market_json, wallet_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    args.decision.observedAt,
    args.wallet.name,
    args.wallet.pubkey,
    args.decision.side,
    args.decision.sizeSol,
    args.decision.reason,
    args.decision.riskPassed ? 1 : 0,
    JSON.stringify(args.decision.riskReasons),
    JSON.stringify(args.market),
    JSON.stringify(args.wallet)
  );

  return Number(result.lastInsertRowid);
}

export function upsertPaperOrder(args: { db: Ledger; order: PaperOrder }): void {
  const stmt = args.db.prepare(`
    INSERT INTO orders (
      id, wallet_name, side, price, size_ui, filled_ui, status, reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      wallet_name = excluded.wallet_name,
      side = excluded.side,
      price = excluded.price,
      size_ui = excluded.size_ui,
      filled_ui = excluded.filled_ui,
      status = excluded.status,
      reason = excluded.reason,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    args.order.id,
    args.order.wallet,
    args.order.side,
    args.order.price,
    args.order.sizeUi,
    args.order.filledUi,
    args.order.status,
    args.order.reason ?? null,
    args.order.createdAt,
    args.order.updatedAt
  );
}
