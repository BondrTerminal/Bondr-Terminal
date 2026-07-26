import { applyFill, type PaperOrder } from '../execution/order-lifecycle.js';
import type { MarketSnapshot, WalletSnapshot } from '../types/decision.js';
import { calculatePaperFillFees, mergePaperFillAccounting, type PaperLiquidityRole } from './paper-fees.js';
import type { PaperQuoteAdapterMap, PaperQuotePlacementSummary, PaperQuoteVenue } from './paper-quotes.js';
import { runPersistAndPlacePaperQuotes } from './paper-quotes.js';
import type { RuntimeStepInput } from './loop.js';
import type { RuntimeStateSummary } from './state.js';

export type PaperFillSimulationSummary = {
  observedAt: string;
  wallet: {
    name: string;
    pubkey: string;
  };
  venue: PaperQuoteVenue | null;
  inspectedOrderCount: number;
  filledOrderCount: number;
  partiallyFilledOrderCount: number;
  openOrderCount: number;
  skippedCount: number;
  skippedReasons: string[];
  filledPaperOrderIds: string[];
  filledGrossNotionalSol: number;
  filledNetNotionalSol: number;
  paperFeesSol: number;
  paperSlippageSol: number;
  liveExecution: false;
  paperOnly: true;
};

export type PaperFillSimulationResult = {
  summary: PaperFillSimulationSummary;
  orders: PaperOrder[];
};

function normalizeFillRatio(fillRatio: number | undefined): number {
  if (fillRatio === undefined) return 1;
  if (!Number.isFinite(fillRatio)) return 0;
  return Math.max(0, Math.min(1, fillRatio));
}

function isActiveFillCandidate(order: PaperOrder): boolean {
  return order.status === 'placed' || order.status === 'partially-filled';
}

function crossesReferencePrice(order: PaperOrder, referencePrice: number): boolean {
  if (order.side === 'buy') return order.price >= referencePrice;
  return order.price <= referencePrice;
}

export function simulatePaperOrderFills(args: {
  orders: PaperOrder[];
  market: Pick<MarketSnapshot, 'observedAt' | 'referencePrice'>;
  wallet: Pick<WalletSnapshot, 'name' | 'pubkey'>;
  venue: PaperQuoteVenue | null;
  fillRatio?: number;
  makerFeeBps?: number;
  takerFeeBps?: number;
  liquidityRole?: PaperLiquidityRole;
}): PaperFillSimulationResult {
  const fillRatio = normalizeFillRatio(args.fillRatio);
  const skippedReasons: string[] = [];
  const updatedOrders: PaperOrder[] = [];
  const filledPaperOrderIds: string[] = [];
  let skippedCount = 0;
  let filledGrossNotionalSol = 0;
  let filledNetNotionalSol = 0;
  let paperFeesSol = 0;
  let paperSlippageSol = 0;

  if (args.orders.length === 0) {
    return {
      summary: {
        observedAt: args.market.observedAt,
        wallet: {
          name: args.wallet.name,
          pubkey: args.wallet.pubkey
        },
        venue: args.venue,
        inspectedOrderCount: 0,
        filledOrderCount: 0,
        partiallyFilledOrderCount: 0,
        openOrderCount: 0,
        skippedCount: 0,
        skippedReasons: [],
        filledPaperOrderIds: [],
        filledGrossNotionalSol: 0,
        filledNetNotionalSol: 0,
        paperFeesSol: 0,
        paperSlippageSol: 0,
        liveExecution: false,
        paperOnly: true
      },
      orders: []
    };
  }

  if (args.market.referencePrice === null) {
    return {
      summary: {
        observedAt: args.market.observedAt,
        wallet: {
          name: args.wallet.name,
          pubkey: args.wallet.pubkey
        },
        venue: args.venue,
        inspectedOrderCount: args.orders.length,
        filledOrderCount: 0,
        partiallyFilledOrderCount: 0,
        openOrderCount: args.orders.filter(isActiveFillCandidate).length,
        skippedCount: args.orders.length,
        skippedReasons: ['paper fill simulation skipped: market reference price is unavailable'],
        filledPaperOrderIds: [],
        filledGrossNotionalSol: 0,
        filledNetNotionalSol: 0,
        paperFeesSol: 0,
        paperSlippageSol: 0,
        liveExecution: false,
        paperOnly: true
      },
      orders: [...args.orders]
    };
  }

  if (args.market.referencePrice <= 0) {
    return {
      summary: {
        observedAt: args.market.observedAt,
        wallet: {
          name: args.wallet.name,
          pubkey: args.wallet.pubkey
        },
        venue: args.venue,
        inspectedOrderCount: args.orders.length,
        filledOrderCount: 0,
        partiallyFilledOrderCount: 0,
        openOrderCount: args.orders.filter(isActiveFillCandidate).length,
        skippedCount: args.orders.length,
        skippedReasons: ['paper fill simulation skipped: market reference price must be positive'],
        filledPaperOrderIds: [],
        filledGrossNotionalSol: 0,
        filledNetNotionalSol: 0,
        paperFeesSol: 0,
        paperSlippageSol: 0,
        liveExecution: false,
        paperOnly: true
      },
      orders: [...args.orders]
    };
  }

  if (fillRatio <= 0) {
    skippedReasons.push('paper fill simulation skipped eligible fills: fillRatio must be greater than 0');
  }

  for (const order of args.orders) {
    if (!isActiveFillCandidate(order)) {
      skippedCount += 1;
      updatedOrders.push(order);
      continue;
    }

    if (!crossesReferencePrice(order, args.market.referencePrice) || fillRatio <= 0) {
      updatedOrders.push(order);
      continue;
    }

    const remainingUi = order.sizeUi - order.filledUi;
    if (remainingUi <= 0) {
      skippedCount += 1;
      updatedOrders.push(order);
      continue;
    }

    const fillSizeUi = remainingUi * fillRatio;
    const fillAccounting = calculatePaperFillFees({
      side: order.side,
      quotedPrice: order.price,
      executedPrice: args.market.referencePrice,
      sizeUi: fillSizeUi,
      makerFeeBps: args.makerFeeBps,
      takerFeeBps: args.takerFeeBps,
      liquidityRole: args.liquidityRole,
      observedAt: args.market.observedAt
    });
    const mergedAccounting = mergePaperFillAccounting({
      existing: order.paperFillAccounting,
      next: fillAccounting
    });
    const filled = {
      ...applyFill({
        order,
        fillSizeUi,
        now: args.market.observedAt
      }),
      paperFillAccounting: mergedAccounting
    };
    filledGrossNotionalSol += fillAccounting.grossNotionalSol;
    filledNetNotionalSol += fillAccounting.netNotionalSol;
    paperFeesSol += fillAccounting.feeSol;
    paperSlippageSol += fillAccounting.slippageSol;
    updatedOrders.push(filled);
    filledPaperOrderIds.push(filled.id);
  }

  return {
    summary: {
      observedAt: args.market.observedAt,
      wallet: {
        name: args.wallet.name,
        pubkey: args.wallet.pubkey
      },
      venue: args.venue,
      inspectedOrderCount: args.orders.length,
      filledOrderCount: updatedOrders.filter((order) => order.status === 'filled').length,
      partiallyFilledOrderCount: updatedOrders.filter((order) => order.status === 'partially-filled').length,
      openOrderCount: updatedOrders.filter(isActiveFillCandidate).length,
      skippedCount,
      skippedReasons,
      filledPaperOrderIds,
      filledGrossNotionalSol,
      filledNetNotionalSol,
      paperFeesSol,
      paperSlippageSol,
      liveExecution: false,
      paperOnly: true
    },
    orders: updatedOrders
  };
}

export async function runPersistPlaceAndFillPaperQuotes(args: {
  input: RuntimeStepInput;
  statePath: string;
  eventPath?: string;
  adapters?: PaperQuoteAdapterMap;
  fillRatio?: number;
  makerFeeBps?: number;
  takerFeeBps?: number;
  liquidityRole?: PaperLiquidityRole;
}): Promise<{
  runtimeState: RuntimeStateSummary;
  paperQuotes: PaperQuotePlacementSummary;
  paperFills: PaperFillSimulationSummary;
  orders: PaperOrder[];
}> {
  const placed = await runPersistAndPlacePaperQuotes({
    input: args.input,
    statePath: args.statePath,
    eventPath: args.eventPath,
    adapters: args.adapters
  });

  const filled = simulatePaperOrderFills({
    orders: placed.orders,
    market: args.input.market,
    wallet: args.input.wallet,
    venue: placed.paperQuotes.venue,
    fillRatio: args.fillRatio,
    makerFeeBps: args.makerFeeBps,
    takerFeeBps: args.takerFeeBps,
    liquidityRole: args.liquidityRole
  });

  return {
    runtimeState: placed.runtimeState,
    paperQuotes: placed.paperQuotes,
    paperFills: filled.summary,
    orders: filled.orders
  };
}
