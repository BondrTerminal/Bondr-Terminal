import { Decimal } from 'decimal.js';
import type { PaperOrder } from '../execution/order-lifecycle.js';
import { drawdownBps } from '../risk/pnl.js';
import type { MarketSnapshot, WalletSnapshot } from '../types/decision.js';

export type PaperPnlSummary = {
  observedAt: string;
  wallet: {
    name: string;
    pubkey: string;
  };
  startingPortfolioValueSol: number;
  currentPaperPortfolioValueSol: number | null;
  realizedPnlSol: number;
  realizedPnlFromMatchedPaperBuysSol: number;
  realizedPnlFromStartingInventorySol: number;
  startingTokenInventoryUi: number;
  startingTokenCostBasisSol: number | null;
  startingTokenAverageCostSol: number | null;
  unrealizedPnlSol: number | null;
  totalPaperPnlSol: number | null;
  drawdownBps: number | null;
  filledBuyVolumeSol: number;
  filledSellVolumeSol: number;
  filledBuySizeUi: number;
  filledSellSizeUi: number;
  filledBuyGrossVolumeSol: number;
  filledSellGrossVolumeSol: number;
  filledBuyNetCostSol: number;
  filledSellNetProceedsSol: number;
  paperFeesSol: number;
  paperSlippageSol: number;
  openBidNotionalSol: number;
  openAskNotionalSol: number;
  activeOpenOrderCount: number;
  filledOrderCount: number;
  skippedCount: number;
  skippedReasons: string[];
  liveExecution: false;
  paperOnly: true;
};

function isActive(order: PaperOrder): boolean {
  return order.status === 'placed' || order.status === 'partially-filled';
}

function positiveFilledSize(order: PaperOrder): Decimal {
  return Decimal.max(new Decimal(order.filledUi), 0);
}

function orderNotional(order: PaperOrder, sizeUi: Decimal): Decimal {
  return sizeUi.mul(order.price);
}

function toNumber(value: Decimal): number {
  return value.toDecimalPlaces(12).toNumber();
}

export function summarizePaperPnl(args: {
  orders: PaperOrder[];
  wallet: Pick<WalletSnapshot, 'name' | 'pubkey' | 'solBalance' | 'tokenBalance'>;
  market: Pick<MarketSnapshot, 'observedAt' | 'referencePrice'>;
  startingPortfolioValueSol: number;
  startingTokenCostBasisSol?: number;
}): PaperPnlSummary {
  const skippedReasons: string[] = [];
  let skippedCount = 0;

  let filledBuySize = new Decimal(0);
  let filledSellSize = new Decimal(0);
  let filledBuyVolume = new Decimal(0);
  let filledSellVolume = new Decimal(0);
  let filledBuyGrossVolume = new Decimal(0);
  let filledSellGrossVolume = new Decimal(0);
  let filledBuyNetCost = new Decimal(0);
  let filledSellNetProceeds = new Decimal(0);
  let paperFees = new Decimal(0);
  let paperSlippage = new Decimal(0);
  let openBidNotional = new Decimal(0);
  let openAskNotional = new Decimal(0);
  let activeOpenOrderCount = 0;
  let filledOrderCount = 0;

  for (const order of args.orders) {
    if (!Number.isFinite(order.price) || order.price <= 0 || !Number.isFinite(order.sizeUi) || order.sizeUi <= 0) {
      skippedCount += 1;
      skippedReasons.push(`paper pnl skipped invalid order ${order.id}`);
      continue;
    }

    const filledSize = positiveFilledSize(order);
    if (filledSize.greaterThan(0)) {
      const accounting = order.paperFillAccounting;
      const filledNotional = accounting === undefined
        ? orderNotional(order, filledSize)
        : new Decimal(accounting.netNotionalSol);
      const grossNotional = accounting === undefined
        ? orderNotional(order, filledSize)
        : new Decimal(accounting.grossNotionalSol);
      const netNotional = accounting === undefined
        ? orderNotional(order, filledSize)
        : new Decimal(accounting.netNotionalSol);
      if (accounting !== undefined) {
        paperFees = paperFees.plus(accounting.feeSol);
        paperSlippage = paperSlippage.plus(accounting.slippageSol);
      }
      if (order.side === 'buy') {
        filledBuySize = filledBuySize.plus(filledSize);
        filledBuyVolume = filledBuyVolume.plus(filledNotional);
        filledBuyGrossVolume = filledBuyGrossVolume.plus(grossNotional);
        filledBuyNetCost = filledBuyNetCost.plus(netNotional);
      } else {
        filledSellSize = filledSellSize.plus(filledSize);
        filledSellVolume = filledSellVolume.plus(filledNotional);
        filledSellGrossVolume = filledSellGrossVolume.plus(grossNotional);
        filledSellNetProceeds = filledSellNetProceeds.plus(netNotional);
      }
    }

    if (order.status === 'filled') filledOrderCount += 1;

    if (isActive(order)) {
      activeOpenOrderCount += 1;
      const remainingSize = Decimal.max(new Decimal(order.sizeUi).minus(order.filledUi), 0);
      const remainingNotional = orderNotional(order, remainingSize);
      if (order.side === 'buy') openBidNotional = openBidNotional.plus(remainingNotional);
      else openAskNotional = openAskNotional.plus(remainingNotional);
    }
  }

  const netSolDelta = filledSellVolume.minus(filledBuyVolume);
  const netTokenDelta = filledBuySize.minus(filledSellSize);
  const currentSolBalance = new Decimal(args.wallet.solBalance).plus(netSolDelta);
  const currentTokenBalance = new Decimal(args.wallet.tokenBalance).plus(netTokenDelta);

  const startingTokenInventory = new Decimal(args.wallet.tokenBalance);
  let startingTokenCostBasis: Decimal | null = null;
  if (args.startingTokenCostBasisSol !== undefined) {
    if (Number.isFinite(args.startingTokenCostBasisSol) && args.startingTokenCostBasisSol >= 0) {
      startingTokenCostBasis = new Decimal(args.startingTokenCostBasisSol);
    } else {
      skippedReasons.push('paper pnl starting inventory cost basis ignored: value must be finite and nonnegative');
    }
  } else if (startingTokenInventory.greaterThan(0)) {
    const inferredCostBasis = new Decimal(args.startingPortfolioValueSol).minus(args.wallet.solBalance);
    if (inferredCostBasis.greaterThanOrEqualTo(0)) {
      startingTokenCostBasis = inferredCostBasis;
    } else {
      skippedReasons.push('paper pnl starting inventory cost basis unavailable: starting portfolio value is below SOL balance');
    }
  }

  const startingTokenAverageCost = startingTokenCostBasis !== null && startingTokenInventory.greaterThan(0)
    ? startingTokenCostBasis.div(startingTokenInventory)
    : null;

  let realizedPnlFromMatchedPaperBuys = new Decimal(0);
  let realizedPnlFromStartingInventory = new Decimal(0);
  if (filledSellSize.greaterThan(0)) {
    const matchedSellSize = Decimal.min(filledSellSize, filledBuySize);
    const averageBuyCost = filledBuySize.greaterThan(0) ? filledBuyVolume.div(filledBuySize) : null;
    const averageSellPrice = filledSellVolume.div(filledSellSize);
    if (averageBuyCost !== null && matchedSellSize.greaterThan(0)) {
      realizedPnlFromMatchedPaperBuys = matchedSellSize.mul(averageSellPrice.minus(averageBuyCost));
    }

    const startingInventorySellSize = Decimal.max(filledSellSize.minus(filledBuySize), 0);
    const matchedStartingInventorySellSize = Decimal.min(startingInventorySellSize, startingTokenInventory);
    if (matchedStartingInventorySellSize.greaterThan(0)) {
      if (startingTokenAverageCost !== null) {
        realizedPnlFromStartingInventory = matchedStartingInventorySellSize.mul(averageSellPrice.minus(startingTokenAverageCost));
      } else {
        skippedReasons.push('paper pnl has sells from starting inventory but no starting inventory cost basis');
      }
    }

    if (startingInventorySellSize.greaterThan(startingTokenInventory)) {
      skippedReasons.push('paper pnl has sells exceeding paper buys plus starting inventory; excess sells are not realized');
    }
  }

  const realizedPnl = realizedPnlFromMatchedPaperBuys.plus(realizedPnlFromStartingInventory);

  let currentPaperPortfolioValueSol: number | null = null;
  let totalPaperPnlSol: number | null = null;
  let unrealizedPnlSol: number | null = null;
  let currentDrawdownBps: number | null = null;

  if (args.market.referencePrice === null) {
    skippedReasons.push('paper pnl mark-to-market skipped: market reference price is unavailable');
  } else if (args.market.referencePrice <= 0 || !Number.isFinite(args.market.referencePrice)) {
    skippedReasons.push('paper pnl mark-to-market skipped: market reference price must be positive');
  } else {
    const currentValue = currentSolBalance.plus(currentTokenBalance.mul(args.market.referencePrice));
    const totalPnl = currentValue.minus(args.startingPortfolioValueSol);
    currentPaperPortfolioValueSol = toNumber(currentValue);
    totalPaperPnlSol = toNumber(totalPnl);
    unrealizedPnlSol = toNumber(totalPnl.minus(realizedPnl));
    currentDrawdownBps = drawdownBps({
      startValueSol: args.startingPortfolioValueSol,
      currentValueSol: currentPaperPortfolioValueSol
    });
  }

  return {
    observedAt: args.market.observedAt,
    wallet: {
      name: args.wallet.name,
      pubkey: args.wallet.pubkey
    },
    startingPortfolioValueSol: args.startingPortfolioValueSol,
    currentPaperPortfolioValueSol,
    realizedPnlSol: toNumber(realizedPnl),
    realizedPnlFromMatchedPaperBuysSol: toNumber(realizedPnlFromMatchedPaperBuys),
    realizedPnlFromStartingInventorySol: toNumber(realizedPnlFromStartingInventory),
    startingTokenInventoryUi: toNumber(startingTokenInventory),
    startingTokenCostBasisSol: startingTokenCostBasis === null ? null : toNumber(startingTokenCostBasis),
    startingTokenAverageCostSol: startingTokenAverageCost === null ? null : toNumber(startingTokenAverageCost),
    unrealizedPnlSol,
    totalPaperPnlSol,
    drawdownBps: currentDrawdownBps,
    filledBuyVolumeSol: toNumber(filledBuyVolume),
    filledSellVolumeSol: toNumber(filledSellVolume),
    filledBuySizeUi: toNumber(filledBuySize),
    filledSellSizeUi: toNumber(filledSellSize),
    filledBuyGrossVolumeSol: toNumber(filledBuyGrossVolume),
    filledSellGrossVolumeSol: toNumber(filledSellGrossVolume),
    filledBuyNetCostSol: toNumber(filledBuyNetCost),
    filledSellNetProceedsSol: toNumber(filledSellNetProceeds),
    paperFeesSol: toNumber(paperFees),
    paperSlippageSol: toNumber(paperSlippage),
    openBidNotionalSol: toNumber(openBidNotional),
    openAskNotionalSol: toNumber(openAskNotional),
    activeOpenOrderCount,
    filledOrderCount,
    skippedCount,
    skippedReasons,
    liveExecution: false,
    paperOnly: true
  };
}
