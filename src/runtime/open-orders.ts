import fs from 'node:fs';
import path from 'node:path';
import type { PaperOrder } from '../execution/order-lifecycle.js';

export type PersistedPaperOpenOrder = Pick<
  PaperOrder,
  | 'id'
  | 'wallet'
  | 'side'
  | 'price'
  | 'sizeUi'
  | 'filledUi'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'reason'
  | 'paperFillAccounting'
>;

const ACTIVE_PAPER_ORDER_STATUSES = new Set<PaperOrder['status']>(['placed', 'partially-filled']);
const VALID_PAPER_ORDER_STATUSES = new Set<PaperOrder['status']>([
  'planned',
  'placed',
  'partially-filled',
  'filled',
  'cancelled',
  'rejected',
  'expired'
]);
const VALID_PAPER_ORDER_SIDES = new Set<PaperOrder['side']>(['buy', 'sell']);

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function sanitizePaperOrder(order: PaperOrder): PersistedPaperOpenOrder {
  return {
    id: order.id,
    wallet: order.wallet,
    side: order.side,
    price: order.price,
    sizeUi: order.sizeUi,
    filledUi: order.filledUi,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    reason: order.reason,
    paperFillAccounting: order.paperFillAccounting
  };
}

function assertOptionalFiniteNumber(value: unknown, field: string, orderId: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`paper open order ${orderId} has invalid paperFillAccounting.${field}`);
  }
}

function assertPaperFillAccountingShape(order: Partial<PaperOrder>): void {
  if (order.paperFillAccounting === undefined) return;
  if (typeof order.paperFillAccounting !== 'object' || order.paperFillAccounting === null) {
    throw new Error(`paper open order ${order.id} has invalid paperFillAccounting`);
  }
  const accounting = order.paperFillAccounting as Partial<NonNullable<PaperOrder['paperFillAccounting']>>;
  for (const field of [
    'quotedPrice',
    'executedPrice',
    'filledSizeUi',
    'grossNotionalSol',
    'feeSol',
    'slippageSol',
    'netNotionalSol',
    'makerFeeBps',
    'takerFeeBps',
    'appliedFeeBps',
    'fillCount'
  ] as const) {
    assertOptionalFiniteNumber(accounting[field], field, order.id ?? 'unknown');
  }
  const required = accounting as NonNullable<PaperOrder['paperFillAccounting']>;
  if (required.quotedPrice <= 0) throw new Error(`paper open order ${order.id} paperFillAccounting.quotedPrice must be positive`);
  if (required.executedPrice <= 0) throw new Error(`paper open order ${order.id} paperFillAccounting.executedPrice must be positive`);
  if (required.filledSizeUi < 0) throw new Error(`paper open order ${order.id} paperFillAccounting.filledSizeUi must be non-negative`);
  if (required.feeSol < 0) throw new Error(`paper open order ${order.id} paperFillAccounting.feeSol must be non-negative`);
  if (required.grossNotionalSol < 0) throw new Error(`paper open order ${order.id} paperFillAccounting.grossNotionalSol must be non-negative`);
  if (required.netNotionalSol < 0) throw new Error(`paper open order ${order.id} paperFillAccounting.netNotionalSol must be non-negative`);
  if (required.makerFeeBps < 0) throw new Error(`paper open order ${order.id} paperFillAccounting.makerFeeBps must be non-negative`);
  if (required.takerFeeBps < 0) throw new Error(`paper open order ${order.id} paperFillAccounting.takerFeeBps must be non-negative`);
  if (required.appliedFeeBps < 0) throw new Error(`paper open order ${order.id} paperFillAccounting.appliedFeeBps must be non-negative`);
  if (!Number.isInteger(required.fillCount) || required.fillCount < 1) {
    throw new Error(`paper open order ${order.id} paperFillAccounting.fillCount must be a positive integer`);
  }
  if (required.liquidityRole !== 'maker' && required.liquidityRole !== 'taker') {
    throw new Error(`paper open order ${order.id} has invalid paperFillAccounting.liquidityRole`);
  }
  if (typeof required.lastObservedAt !== 'string' || Number.isNaN(Date.parse(required.lastObservedAt))) {
    throw new Error(`paper open order ${order.id} has invalid paperFillAccounting.lastObservedAt`);
  }
}

function assertPaperOrderShape(value: unknown, index: number): asserts value is PaperOrder {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`paper open order at index ${index} must be an object`);
  }
  const order = value as Partial<PaperOrder>;
  if (typeof order.id !== 'string' || order.id.length === 0) throw new Error(`paper open order at index ${index} has invalid id`);
  if (typeof order.wallet !== 'string' || order.wallet.length === 0) throw new Error(`paper open order ${order.id} has invalid wallet`);
  if (typeof order.side !== 'string' || !VALID_PAPER_ORDER_SIDES.has(order.side as PaperOrder['side'])) {
    throw new Error(`paper open order ${order.id} has invalid side`);
  }
  const price = order.price;
  const sizeUi = order.sizeUi;
  const filledUi = order.filledUi;
  if (typeof price !== 'number' || !Number.isFinite(price)) throw new Error(`paper open order ${order.id} has invalid price`);
  if (typeof sizeUi !== 'number' || !Number.isFinite(sizeUi)) throw new Error(`paper open order ${order.id} has invalid sizeUi`);
  if (typeof filledUi !== 'number' || !Number.isFinite(filledUi)) throw new Error(`paper open order ${order.id} has invalid filledUi`);
  if (price <= 0) throw new Error(`paper open order ${order.id} price must be positive`);
  if (sizeUi <= 0) throw new Error(`paper open order ${order.id} sizeUi must be positive`);
  if (filledUi < 0) throw new Error(`paper open order ${order.id} filledUi must be non-negative`);
  if (typeof order.status !== 'string' || !VALID_PAPER_ORDER_STATUSES.has(order.status as PaperOrder['status'])) {
    throw new Error(`paper open order ${order.id} has invalid status`);
  }
  if (typeof order.createdAt !== 'string' || Number.isNaN(Date.parse(order.createdAt))) {
    throw new Error(`paper open order ${order.id} has invalid createdAt`);
  }
  if (typeof order.updatedAt !== 'string' || Number.isNaN(Date.parse(order.updatedAt))) {
    throw new Error(`paper open order ${order.id} has invalid updatedAt`);
  }
  if (order.reason !== undefined && typeof order.reason !== 'string') {
    throw new Error(`paper open order ${order.id} has invalid reason`);
  }
  assertPaperFillAccountingShape(order);
}

function parsePaperOrders(raw: string, filePath: string): PaperOrder[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('top-level value must be an array');
    return parsed.map((value, index) => {
      assertPaperOrderShape(value, index);
      return sanitizePaperOrder(value) as PaperOrder;
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to read paper open orders from ${filePath}: ${reason}`);
  }
}

export function filterActivePaperOrders(orders: PaperOrder[]): PaperOrder[] {
  return orders.filter((order) => ACTIVE_PAPER_ORDER_STATUSES.has(order.status));
}

export function writePaperOpenOrders(filePath: string, orders: PaperOrder[]): void {
  ensureParentDir(filePath);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const safeOrders = orders.map(sanitizePaperOrder);
  fs.writeFileSync(tmpPath, `${JSON.stringify(safeOrders, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

export function readPaperOpenOrders(filePath: string): PaperOrder[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.trim().length === 0) return [];
  return parsePaperOrders(raw, filePath);
}

export function replacePaperOpenOrders(filePath: string, nextOrders: PaperOrder[]): void {
  writePaperOpenOrders(filePath, filterActivePaperOrders(nextOrders));
}
