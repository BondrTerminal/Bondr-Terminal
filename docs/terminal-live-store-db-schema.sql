-- Terminal live-store durability schema for Neon/Postgres.
-- Safe to run multiple times.
-- Stores dry-run/live-readiness order state, transaction intents, and mutation audit logs.
-- Does not enable signing, broadcasting, relay/Jito, or live trading.

create table if not exists terminal_orders (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  status text not null,
  payload jsonb not null
);

create index if not exists terminal_orders_status_idx on terminal_orders (status);
create index if not exists terminal_orders_created_at_idx on terminal_orders (created_at desc);

create table if not exists terminal_transaction_intents (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null,
  expected_signer text not null,
  expected_mint text not null,
  expected_side text not null,
  expected_amount text,
  slippage_bps integer,
  allowed_programs jsonb not null default '[]'::jsonb,
  required_accounts jsonb not null default '[]'::jsonb,
  source_route text not null,
  order_id text,
  bundle_id text,
  quote_hash text,
  route_hash text,
  transaction_message_hash text,
  note text
);

create index if not exists terminal_transaction_intents_status_idx on terminal_transaction_intents (status);
create index if not exists terminal_transaction_intents_expires_at_idx on terminal_transaction_intents (expires_at);
create index if not exists terminal_transaction_intents_order_id_idx on terminal_transaction_intents (order_id);

create table if not exists terminal_mutation_audit_logs (
  id text primary key,
  route text not null,
  action text not null,
  actor text not null,
  observed_at timestamptz not null,
  status text not null,
  request_fingerprint text not null,
  note text
);

create index if not exists terminal_mutation_audit_logs_observed_at_idx on terminal_mutation_audit_logs (observed_at desc);
create index if not exists terminal_mutation_audit_logs_route_idx on terminal_mutation_audit_logs (route);
