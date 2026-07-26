import { Decimal } from 'decimal.js';
import type { OrderSide, PaperFillAccounting } from '../execution/order-lifecycle.js';

export type PaperLiquidityRole = 'maker' | 'taker';

export type PaperFillFeeInput = {
  side: OrderSide;
  quotedPrice: number;
  executedPrice: number;
  sizeUi: number;
  makerFeeBps?: number;
  takerFeeBps?: number;
  liquidityRole?: PaperLiquidityRole;
  observedAt: string;
};

export type PaperFillFeeResult = PaperFillAccounting;

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative finite number`);
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
}

function toNumber(value: Decimal): number {
  return value.toDecimalPlaces(12).toNumber();
}

export function calculatePaperFillFees(args: PaperFillFeeInput): PaperFillFeeResult {
  assertPositiveFinite(args.quotedPrice, 'quotedPrice');
  assertPositiveFinite(args.executedPrice, 'executedPrice');
  assertPositiveFinite(args.sizeUi, 'sizeUi');
  const makerFeeBps = args.makerFeeBps ?? 0;
  const takerFeeBps = args.takerFeeBps ?? (makerFeeBps >= 0 ? makerFeeBps : 0);
  assertFinite(makerFeeBps, 'makerFeeBps');
  assertNonNegativeFinite(takerFeeBps, 'takerFeeBps');

  const liquidityRole = args.liquidityRole ?? 'maker';
  const appliedFeeBps = liquidityRole === 'maker' ? makerFeeBps : takerFeeBps;
  const size = new Decimal(args.sizeUi);
  const quotedPrice = new Decimal(args.quotedPrice);
  const executedPrice = new Decimal(args.executedPrice);
  const grossNotional = executedPrice.mul(size);
  const feeSol = grossNotional.mul(appliedFeeBps).div(10_000);
  const slippageSol = args.side === 'buy'
    ? executedPrice.minus(quotedPrice).mul(size)
    : quotedPrice.minus(executedPrice).mul(size);
  const netNotional = args.side === 'buy'
    ? grossNotional.plus(feeSol)
    : grossNotional.minus(feeSol);

  return {
    quotedPrice: toNumber(quotedPrice),
    executedPrice: toNumber(executedPrice),
    filledSizeUi: toNumber(size),
    grossNotionalSol: toNumber(grossNotional),
    feeSol: toNumber(feeSol),
    slippageSol: toNumber(slippageSol),
    netNotionalSol: toNumber(netNotional),
    makerFeeBps,
    takerFeeBps,
    appliedFeeBps,
    liquidityRole,
    fillCount: 1,
    lastObservedAt: args.observedAt
  };
}

export function mergePaperFillAccounting(args: {
  existing?: PaperFillAccounting;
  next: PaperFillAccounting;
}): PaperFillAccounting {
  const existing = args.existing;
  if (existing === undefined) return args.next;

  const existingSize = new Decimal(existing.filledSizeUi);
  const nextSize = new Decimal(args.next.filledSizeUi);
  const totalSize = existingSize.plus(nextSize);
  if (totalSize.lessThanOrEqualTo(0)) return args.next;

  const weightedQuoted = new Decimal(existing.quotedPrice).mul(existingSize)
    .plus(new Decimal(args.next.quotedPrice).mul(nextSize))
    .div(totalSize);
  const weightedExecuted = new Decimal(existing.executedPrice).mul(existingSize)
    .plus(new Decimal(args.next.executedPrice).mul(nextSize))
    .div(totalSize);

  return {
    quotedPrice: toNumber(weightedQuoted),
    executedPrice: toNumber(weightedExecuted),
    filledSizeUi: toNumber(totalSize),
    grossNotionalSol: toNumber(new Decimal(existing.grossNotionalSol).plus(args.next.grossNotionalSol)),
    feeSol: toNumber(new Decimal(existing.feeSol).plus(args.next.feeSol)),
    slippageSol: toNumber(new Decimal(existing.slippageSol).plus(args.next.slippageSol)),
    netNotionalSol: toNumber(new Decimal(existing.netNotionalSol).plus(args.next.netNotionalSol)),
    makerFeeBps: args.next.makerFeeBps,
    takerFeeBps: args.next.takerFeeBps,
    appliedFeeBps: args.next.appliedFeeBps,
    liquidityRole: args.next.liquidityRole,
    fillCount: existing.fillCount + args.next.fillCount,
    lastObservedAt: args.next.lastObservedAt
  };
}
