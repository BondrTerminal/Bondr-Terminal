export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'planned' | 'placed' | 'partially-filled' | 'filled' | 'cancelled' | 'rejected' | 'expired';

export type PaperFillAccounting = {
  quotedPrice: number;
  executedPrice: number;
  filledSizeUi: number;
  grossNotionalSol: number;
  feeSol: number;
  slippageSol: number;
  netNotionalSol: number;
  makerFeeBps: number;
  takerFeeBps: number;
  appliedFeeBps: number;
  liquidityRole: 'maker' | 'taker';
  fillCount: number;
  lastObservedAt: string;
};

export type PaperOrder = {
  id: string;
  wallet: string;
  side: OrderSide;
  price: number;
  sizeUi: number;
  filledUi: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  reason?: string;
  paperFillAccounting?: PaperFillAccounting;
};

export function createPaperOrder(args: {
  id: string;
  wallet: string;
  side: OrderSide;
  price: number;
  sizeUi: number;
  now?: string;
}): PaperOrder {
  const now = args.now ?? new Date().toISOString();
  if (args.price <= 0) throw new Error('order price must be positive');
  if (args.sizeUi <= 0) throw new Error('order size must be positive');
  return {
    id: args.id,
    wallet: args.wallet,
    side: args.side,
    price: args.price,
    sizeUi: args.sizeUi,
    filledUi: 0,
    status: 'planned',
    createdAt: now,
    updatedAt: now
  };
}

export function markPlaced(order: PaperOrder, now = new Date().toISOString()): PaperOrder {
  if (order.status !== 'planned') throw new Error(`cannot place order from status ${order.status}`);
  return { ...order, status: 'placed', updatedAt: now };
}

export function applyFill(args: {
  order: PaperOrder;
  fillSizeUi: number;
  now?: string;
}): PaperOrder {
  const { order } = args;
  if (!['placed', 'partially-filled'].includes(order.status)) {
    throw new Error(`cannot fill order from status ${order.status}`);
  }
  if (args.fillSizeUi <= 0) throw new Error('fill size must be positive');
  const filledUi = Math.min(order.sizeUi, order.filledUi + args.fillSizeUi);
  return {
    ...order,
    filledUi,
    status: filledUi >= order.sizeUi ? 'filled' : 'partially-filled',
    updatedAt: args.now ?? new Date().toISOString()
  };
}

export function cancelOrder(args: {
  order: PaperOrder;
  reason: string;
  now?: string;
}): PaperOrder {
  if (['filled', 'cancelled', 'rejected', 'expired'].includes(args.order.status)) {
    throw new Error(`cannot cancel terminal order ${args.order.status}`);
  }
  return {
    ...args.order,
    status: 'cancelled',
    reason: args.reason,
    updatedAt: args.now ?? new Date().toISOString()
  };
}

export function expireStaleOrder(args: {
  order: PaperOrder;
  maxAgeMs: number;
  nowMs?: number;
}): PaperOrder {
  const nowMs = args.nowMs ?? Date.now();
  const createdMs = Date.parse(args.order.createdAt);
  if (!Number.isFinite(createdMs)) throw new Error('order createdAt is invalid');
  if (nowMs - createdMs < args.maxAgeMs) return args.order;
  if (['filled', 'cancelled', 'rejected', 'expired'].includes(args.order.status)) return args.order;
  return {
    ...args.order,
    status: 'expired',
    reason: `order exceeded max age ${args.maxAgeMs}ms`,
    updatedAt: new Date(nowMs).toISOString()
  };
}
