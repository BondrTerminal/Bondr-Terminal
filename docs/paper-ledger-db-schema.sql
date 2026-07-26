-- Meridian paper ledger DB schema for Neon/Postgres.
-- Required server-only env for production durability:
--   DATABASE_URL=postgresql://...
-- Use Neon pooled connection string in Vercel Production.
-- Do not expose this value to the browser.

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
