-- Solana SPL Market Maker ledger schema
-- v0: append-only decision/fill/event log. Do not mutate historical rows.

CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observed_at TEXT NOT NULL,
  wallet_name TEXT,
  wallet_pubkey TEXT,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell', 'wait')),
  size_sol REAL NOT NULL,
  reason TEXT NOT NULL,
  risk_passed INTEGER NOT NULL CHECK (risk_passed IN (0, 1)),
  risk_reasons_json TEXT NOT NULL,
  market_json TEXT NOT NULL,
  wallet_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  wallet_name TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  price REAL NOT NULL,
  size_ui REAL NOT NULL,
  filled_ui REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('planned', 'placed', 'partially-filled', 'filled', 'cancelled', 'rejected', 'expired')),
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id INTEGER,
  mode TEXT NOT NULL CHECK (mode IN ('paper', 'live')),
  signature TEXT,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  input_mint TEXT NOT NULL,
  output_mint TEXT NOT NULL,
  input_amount_ui REAL NOT NULL,
  output_amount_ui REAL NOT NULL,
  price REAL NOT NULL,
  fee_sol REAL NOT NULL DEFAULT 0,
  slippage_bps REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (decision_id) REFERENCES decisions(id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_decisions_observed_at ON decisions(observed_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at);
CREATE INDEX IF NOT EXISTS idx_fills_created_at ON fills(created_at);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
