import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJsonWrite } from './mutation-safety';

export type TerminalOrderKind = 'market' | 'limit' | 'take-profit' | 'stop-loss';
export type TerminalOrderSide = 'buy' | 'sell';
export type TerminalOrderStatus = 'open' | 'triggered' | 'cancelled' | 'replaced' | 'expired' | 'error';
export type TerminalOrderLifecycleStage = 'created' | 'evaluated' | 'triggered' | 'transaction_built' | 'signed_client_side' | 'broadcast' | 'confirmed' | 'failed';

export type TerminalOrder = {
  id: string;
  createdAt: string;
  updatedAt: string;
  mint: string;
  wallet: string;
  side: TerminalOrderSide;
  kind: TerminalOrderKind;
  status: TerminalOrderStatus;
  amount: string;
  spendAsset: 'SOL' | 'USDC';
  slippageBps: number;
  triggerPriceUsd: number | null;
  triggerDirection: 'above' | 'below' | null;
  expiresAt: string | null;
  lastEvaluationAt: string | null;
  lastObservedPriceUsd: number | null;
  triggeredAt: string | null;
  replacementFor: string | null;
  error: string | null;
  clientTag?: string | null;
  lifecycleStage?: TerminalOrderLifecycleStage;
  lifecycle?: Array<{ stage: TerminalOrderLifecycleStage; at: string; note?: string | null; priceUsd?: number | null; signature?: string | null }> | null;
  transactionBase64?: string | null;
  signature?: string | null;
  confirmedAt?: string | null;
};

export type TerminalOrderStore = {
  version: 1;
  orders: TerminalOrder[];
};

const TERMINAL_ORDER_STORE_PATH = join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'terminal-orders.json');

export function terminalOrderStorePath() {
  return TERMINAL_ORDER_STORE_PATH;
}

function emptyStore(): TerminalOrderStore {
  return { version: 1, orders: [] };
}

export function readTerminalOrderStore(): TerminalOrderStore {
  const path = terminalOrderStorePath();
  if (!existsSync(path)) return emptyStore();
  return JSON.parse(readFileSync(path, 'utf8')) as TerminalOrderStore;
}

export function writeTerminalOrderStore(store: TerminalOrderStore) {
  const path = terminalOrderStorePath();
  mkdirSync(dirname(path), { recursive: true });
  atomicJsonWrite(path, store);
}

export function createTerminalOrder(input: Omit<TerminalOrder, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'lastEvaluationAt' | 'lastObservedPriceUsd' | 'triggeredAt' | 'replacementFor' | 'error'> & Partial<Pick<TerminalOrder, 'status' | 'replacementFor' | 'error'>>) {
  const now = new Date().toISOString();
  const order: TerminalOrder = {
    ...input,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: input.status ?? 'open',
    lastEvaluationAt: null,
    lastObservedPriceUsd: null,
    triggeredAt: null,
    replacementFor: input.replacementFor ?? null,
    error: input.error ?? null,
    lifecycleStage: 'created',
    lifecycle: [{ stage: 'created', at: now, note: 'Order stored in terminal order engine.' }],
    transactionBase64: null,
    signature: null,
    confirmedAt: null
  };
  const store = readTerminalOrderStore();
  store.orders.unshift(order);
  writeTerminalOrderStore(store);
  return order;
}

export function appendOrderLifecycle(order: TerminalOrder, event: { stage: TerminalOrderLifecycleStage; note?: string | null; priceUsd?: number | null; signature?: string | null }) {
  const at = new Date().toISOString();
  return {
    lifecycleStage: event.stage,
    lifecycle: [...(order.lifecycle ?? []), { stage: event.stage, at, note: event.note ?? null, priceUsd: event.priceUsd ?? null, signature: event.signature ?? null }]
  } satisfies Partial<TerminalOrder>;
}

export function updateTerminalOrder(id: string, patch: Partial<TerminalOrder>) {
  const store = readTerminalOrderStore();
  const index = store.orders.findIndex((order) => order.id === id);
  if (index === -1) return null;
  store.orders[index] = { ...store.orders[index], ...patch, updatedAt: new Date().toISOString() };
  writeTerminalOrderStore(store);
  return store.orders[index];
}

export function listTerminalOrders(filter?: { mint?: string | null; wallet?: string | null; status?: TerminalOrderStatus | 'all' | null }) {
  const store = readTerminalOrderStore();
  return store.orders.filter((order) => {
    if (filter?.mint && order.mint !== filter.mint) return false;
    if (filter?.wallet && order.wallet !== filter.wallet) return false;
    if (filter?.status && filter.status !== 'all' && order.status !== filter.status) return false;
    return true;
  });
}
