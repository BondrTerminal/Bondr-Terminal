import { Decimal } from 'decimal.js';
import type { PaperOrder } from '../execution/order-lifecycle.js';

export type PaperSpreadCaptureSummary = {
  matchedSizeUi: number;
  unmatchedInventoryUi: number;
  averageBuyQuotedPrice: number | null;
  averageSellQuotedPrice: number | null;
  averageBuyExecutedPrice: number | null;
  averageSellExecutedPrice: number | null;
  quotedSpreadSol: number | null;
  quotedSpreadBps: number | null;
  executedSpreadSol: number | null;
  executedSpreadBps: number | null;
  grossSpreadCapturedSol: number;
  feeAdjustedSpreadCapturedSol: number;
  totalFeesSol: number;
  slippageAttributionSol: number;
  buyFillCount: number;
  sellFillCount: number;
  skippedCount: number;
  skippedReasons: string[];
  liveExecution: false;
  paperOnly: true;
};

type SideTotals = {
  size: Decimal;
  quotedNotional: Decimal;
  executedNotional: Decimal;
  netNotional: Decimal;
  fees: Decimal;
  slippage: Decimal;
  fillCount: number;
};

function emptySideTotals(): SideTotals {
  return {
    size: new Decimal(0),
    quotedNotional: new Decimal(0),
    executedNotional: new Decimal(0),
    netNotional: new Decimal(0),
    fees: new Decimal(0),
    slippage: new Decimal(0),
    fillCount: 0
  };
}

function toNumber(value: Decimal): number {
  return value.toDecimalPlaces(12).toNumber();
}

function spreadBps(buyPrice: Decimal, sellPrice: Decimal): number | null {
  const midpoint = buyPrice.plus(sellPrice).div(2);
  if (midpoint.lte(0)) return null;
  return toNumber(sellPrice.minus(buyPrice).div(midpoint).mul(10_000));
}

function weightedAverage(notional: Decimal, size: Decimal): Decimal | null {
  if (size.lte(0)) return null;
  return notional.div(size);
}

export function summarizePaperSpreadCapture(args: { orders: PaperOrder[] }): PaperSpreadCaptureSummary {
  const buys = emptySideTotals();
  const sells = emptySideTotals();
  const skippedReasons: string[] = [];
  let skippedCount = 0;

  for (const order of args.orders) {
    if (order.filledUi <= 0) continue;
    const accounting = order.paperFillAccounting;
    if (accounting === undefined) {
      skippedCount += 1;
      skippedReasons.push(`spread capture skipped order ${order.id}: missing paper fill accounting`);
      continue;
    }
    if (accounting.filledSizeUi <= 0) {
      skippedCount += 1;
      skippedReasons.push(`spread capture skipped order ${order.id}: non-positive filled size`);
      continue;
    }

    const target = order.side === 'buy' ? buys : sells;
    const size = new Decimal(accounting.filledSizeUi);
    target.size = target.size.plus(size);
    target.quotedNotional = target.quotedNotional.plus(new Decimal(accounting.quotedPrice).mul(size));
    target.executedNotional = target.executedNotional.plus(new Decimal(accounting.executedPrice).mul(size));
    target.netNotional = target.netNotional.plus(accounting.netNotionalSol);
    target.fees = target.fees.plus(accounting.feeSol);
    target.slippage = target.slippage.plus(accounting.slippageSol);
    target.fillCount += accounting.fillCount;
  }

  const matchedSize = Decimal.min(buys.size, sells.size);
  const unmatchedInventory = buys.size.minus(sells.size);
  const avgBuyQuoted = weightedAverage(buys.quotedNotional, buys.size);
  const avgSellQuoted = weightedAverage(sells.quotedNotional, sells.size);
  const avgBuyExecuted = weightedAverage(buys.executedNotional, buys.size);
  const avgSellExecuted = weightedAverage(sells.executedNotional, sells.size);

  let quotedSpreadSol: Decimal | null = null;
  let executedSpreadSol: Decimal | null = null;
  let quotedSpreadBps: number | null = null;
  let executedSpreadBps: number | null = null;
  let grossSpreadCaptured = new Decimal(0);
  let feeAdjustedSpreadCaptured = new Decimal(0);

  if (matchedSize.gt(0)
    && avgBuyQuoted !== null
    && avgSellQuoted !== null
    && avgBuyExecuted !== null
    && avgSellExecuted !== null) {
    quotedSpreadSol = avgSellQuoted.minus(avgBuyQuoted);
    executedSpreadSol = avgSellExecuted.minus(avgBuyExecuted);
    quotedSpreadBps = spreadBps(avgBuyQuoted, avgSellQuoted);
    executedSpreadBps = spreadBps(avgBuyExecuted, avgSellExecuted);
    grossSpreadCaptured = matchedSize.mul(executedSpreadSol);

    const avgBuyNetCost = buys.netNotional.div(buys.size);
    const avgSellNetProceeds = sells.netNotional.div(sells.size);
    feeAdjustedSpreadCaptured = matchedSize.mul(avgSellNetProceeds.minus(avgBuyNetCost));
  }

  return {
    matchedSizeUi: toNumber(matchedSize),
    unmatchedInventoryUi: toNumber(unmatchedInventory),
    averageBuyQuotedPrice: avgBuyQuoted === null ? null : toNumber(avgBuyQuoted),
    averageSellQuotedPrice: avgSellQuoted === null ? null : toNumber(avgSellQuoted),
    averageBuyExecutedPrice: avgBuyExecuted === null ? null : toNumber(avgBuyExecuted),
    averageSellExecutedPrice: avgSellExecuted === null ? null : toNumber(avgSellExecuted),
    quotedSpreadSol: quotedSpreadSol === null ? null : toNumber(quotedSpreadSol),
    quotedSpreadBps,
    executedSpreadSol: executedSpreadSol === null ? null : toNumber(executedSpreadSol),
    executedSpreadBps,
    grossSpreadCapturedSol: toNumber(grossSpreadCaptured),
    feeAdjustedSpreadCapturedSol: toNumber(feeAdjustedSpreadCaptured),
    totalFeesSol: toNumber(buys.fees.plus(sells.fees)),
    slippageAttributionSol: toNumber(buys.slippage.plus(sells.slippage)),
    buyFillCount: buys.fillCount,
    sellFillCount: sells.fillCount,
    skippedCount,
    skippedReasons,
    liveExecution: false,
    paperOnly: true
  };
}
