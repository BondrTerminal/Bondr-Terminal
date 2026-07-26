import {
  cancelOrder as cancelPaperOrderLifecycle,
  expireStaleOrder,
  type PaperOrder
} from '../execution/order-lifecycle.js';
import type { MarketSnapshot, WalletSnapshot } from '../types/decision.js';
import type { MarketMakerConfig } from '../types/config.js';
import { runRuntimeStep, type RuntimeStepInput } from './loop.js';
import { readPaperOpenOrders, replacePaperOpenOrders, filterActivePaperOrders } from './open-orders.js';
import { placePaperQuotes, type PaperQuoteAdapterMap, type PaperQuoteVenue } from './paper-quotes.js';
import { simulatePaperOrderFills, type PaperFillSimulationSummary } from './paper-fills.js';
import { selectPaperFeePreset, type PaperFeePresetName, type PaperFeeSelection } from './paper-fee-presets.js';
import { summarizePaperPnl, type PaperPnlSummary } from './paper-pnl.js';
import { evaluatePaperRisk, type PaperRiskSummary } from './paper-risk.js';
import { summarizeRuntimeStep, writeRuntimeState, appendRuntimeEvent, type RuntimeStateSummary } from './state.js';
import type { PaperVenueAdapter } from '../venue/paper-adapter.js';

const TERMINAL_STATUSES = new Set<PaperOrder['status']>(['filled', 'cancelled', 'rejected', 'expired']);

export type PaperCancelReplaceSummary = {
  observedAt: string;
  wallet: {
    name: string;
    pubkey: string;
  };
  venue: PaperQuoteVenue | null;
  startingOpenOrderCount: number;
  cancelledOrderCount: number;
  expiredOrderCount: number;
  retainedOpenOrderCount: number;
  placedReplacementOrderCount: number;
  endingOpenOrderCount: number;
  skippedCount: number;
  skippedReasons: string[];
  cancelledPaperOrderIds: string[];
  expiredPaperOrderIds: string[];
  placedPaperOrderIds: string[];
  liveExecution: false;
  paperOnly: true;
};

export type PaperCancelReplaceResult = {
  summary: PaperCancelReplaceSummary;
  orders: PaperOrder[];
};

function isActive(order: PaperOrder): boolean {
  return order.status === 'placed' || order.status === 'partially-filled';
}

function priceDeviationRequiresCancel(args: {
  order: PaperOrder;
  referencePrice: number | null;
  maxCrossBps: number;
}): string | null {
  if (args.referencePrice === null) return 'market reference price is unavailable';
  if (args.referencePrice <= 0) return 'market reference price must be positive';
  const maxCross = args.maxCrossBps / 10_000;
  if (args.order.side === 'buy' && args.order.price > args.referencePrice * (1 + maxCross)) {
    return `buy order price ${args.order.price} is too far above reference ${args.referencePrice}`;
  }
  if (args.order.side === 'sell' && args.order.price < args.referencePrice * (1 - maxCross)) {
    return `sell order price ${args.order.price} is too far below reference ${args.referencePrice}`;
  }
  return null;
}

async function bestEffortAdapterCancel(args: {
  adapter: PaperVenueAdapter | undefined;
  orderId: string;
  reason: string;
}): Promise<void> {
  if (args.adapter === undefined) return;
  if (args.adapter.getPaperOrder(args.orderId) === null) return;
  await args.adapter.cancelPaperOrder(args.orderId, args.reason);
}

export async function cancelReplacePaperOrders(args: {
  config: Pick<MarketMakerConfig, 'execution' | 'globalRisk'>;
  wallet: Pick<WalletSnapshot, 'name' | 'pubkey'>;
  market: Pick<MarketSnapshot, 'observedAt' | 'referencePrice'>;
  openOrders: PaperOrder[];
  quoteLevels: Parameters<typeof placePaperQuotes>[0]['quoteLevels'];
  adapters?: PaperQuoteAdapterMap;
  maxAgeMs?: number;
  maxCrossBps?: number;
}): Promise<PaperCancelReplaceResult> {
  const maxAgeMs = args.maxAgeMs ?? args.config.globalRisk.maxMarketDataAgeMs;
  const maxCrossBps = args.maxCrossBps ?? args.config.globalRisk.maxSlippageBps;
  const retained: PaperOrder[] = [];
  const cancelledPaperOrderIds: string[] = [];
  const expiredPaperOrderIds: string[] = [];
  const skippedReasons: string[] = [];
  let skippedCount = 0;

  const initialVenue = args.config.execution.venues.find((venue) => venue === 'openbook') as PaperQuoteVenue | undefined;
  const adapter = initialVenue === undefined ? undefined : args.adapters?.[initialVenue];

  for (const order of args.openOrders) {
    if (TERMINAL_STATUSES.has(order.status)) {
      skippedCount += 1;
      skippedReasons.push(`removed terminal paper order ${order.id} with status ${order.status}`);
      continue;
    }

    if (!isActive(order)) {
      skippedCount += 1;
      skippedReasons.push(`removed inactive paper order ${order.id} with status ${order.status}`);
      continue;
    }

    if (order.wallet !== args.wallet.name) {
      const reason = `paper cancel: order wallet ${order.wallet} does not match active wallet ${args.wallet.name}`;
      await bestEffortAdapterCancel({ adapter, orderId: order.id, reason });
      cancelPaperOrderLifecycle({ order, reason, now: args.market.observedAt });
      cancelledPaperOrderIds.push(order.id);
      continue;
    }

    const expired = expireStaleOrder({
      order,
      maxAgeMs,
      nowMs: Date.parse(args.market.observedAt)
    });
    if (expired.status === 'expired') {
      expiredPaperOrderIds.push(expired.id);
      continue;
    }

    const cancelReason = priceDeviationRequiresCancel({
      order,
      referencePrice: args.market.referencePrice,
      maxCrossBps
    });
    if (cancelReason !== null) {
      await bestEffortAdapterCancel({ adapter, orderId: order.id, reason: `paper cancel: ${cancelReason}` });
      cancelPaperOrderLifecycle({ order, reason: `paper cancel: ${cancelReason}`, now: args.market.observedAt });
      cancelledPaperOrderIds.push(order.id);
      continue;
    }

    retained.push(order);
  }

  const retainedSides = new Set(retained.map((order) => order.side === 'buy' ? 'bid' : 'ask'));
  const replacementLevels = retained.length === 0
    ? args.quoteLevels.levels
    : args.quoteLevels.levels.filter((level) => !retainedSides.has(level.side));

  const quoteLevelsForPlacement = retained.length > 0
    ? {
      ...args.quoteLevels,
      levels: replacementLevels,
      skipped: replacementLevels.length === 0,
      reason: replacementLevels.length === 0
        ? 'paper quote placement skipped: retained valid active paper orders on both sides'
        : 'paper quote placement replenishes missing side only; retained valid active paper orders are not stacked'
    }
    : args.quoteLevels;

  const placed = await placePaperQuotes({
    config: args.config,
    wallet: args.wallet,
    quoteLevels: quoteLevelsForPlacement,
    adapters: args.adapters
  });

  const nextOrders = [...retained, ...placed.orders];
  const endingOpenOrders = filterActivePaperOrders(nextOrders);
  const skippedReasonsCombined = [...skippedReasons, ...placed.summary.skippedReasons];

  return {
    summary: {
      observedAt: args.market.observedAt,
      wallet: {
        name: args.wallet.name,
        pubkey: args.wallet.pubkey
      },
      venue: placed.summary.venue,
      startingOpenOrderCount: args.openOrders.length,
      cancelledOrderCount: cancelledPaperOrderIds.length,
      expiredOrderCount: expiredPaperOrderIds.length,
      retainedOpenOrderCount: retained.length,
      placedReplacementOrderCount: placed.summary.placedOrderCount,
      endingOpenOrderCount: endingOpenOrders.length,
      skippedCount: skippedCount + placed.summary.skippedCount,
      skippedReasons: skippedReasonsCombined,
      cancelledPaperOrderIds,
      expiredPaperOrderIds,
      placedPaperOrderIds: placed.summary.paperOrderIds,
      liveExecution: false,
      paperOnly: true
    },
    orders: endingOpenOrders
  };
}

export async function runPaperRuntimeCycle(args: {
  input: RuntimeStepInput;
  statePath: string;
  openOrdersPath: string;
  eventPath?: string;
  adapters?: PaperQuoteAdapterMap;
  maxAgeMs?: number;
  maxCrossBps?: number;
  fillRatio?: number;
  makerFeeBps?: number;
  takerFeeBps?: number;
  paperFeePresetName?: PaperFeePresetName;
}): Promise<{
  runtimeState: RuntimeStateSummary;
  cancelReplace: PaperCancelReplaceSummary;
  paperFills: PaperFillSimulationSummary;
  paperPnl: PaperPnlSummary;
  paperRisk: PaperRiskSummary;
  paperFeePreset: PaperFeeSelection;
  orders: PaperOrder[];
}> {
  const existingOpenOrders = readPaperOpenOrders(args.openOrdersPath);
  const runtimeStep = runRuntimeStep(args.input);
  const runtimeState = summarizeRuntimeStep(runtimeStep, {
    mode: args.input.config.mode,
    wallet: args.input.wallet,
    market: args.input.market
  });
  writeRuntimeState(args.statePath, runtimeState);

  const cancelReplace = await cancelReplacePaperOrders({
    config: args.input.config,
    wallet: args.input.wallet,
    market: args.input.market,
    openOrders: existingOpenOrders,
    quoteLevels: runtimeStep.quoteLevels,
    adapters: args.adapters,
    maxAgeMs: args.maxAgeMs,
    maxCrossBps: args.maxCrossBps
  });

  const paperFeePreset = selectPaperFeePreset({
    venue: cancelReplace.summary.venue,
    presetName: args.paperFeePresetName,
    makerFeeBps: args.makerFeeBps,
    takerFeeBps: args.takerFeeBps
  });

  const filled = simulatePaperOrderFills({
    orders: cancelReplace.orders,
    market: args.input.market,
    wallet: args.input.wallet,
    venue: cancelReplace.summary.venue,
    fillRatio: args.fillRatio,
    makerFeeBps: paperFeePreset.makerFeeBps,
    takerFeeBps: paperFeePreset.takerFeeBps,
    liquidityRole: 'maker'
  });

  const paperPnl = summarizePaperPnl({
    orders: filled.orders,
    wallet: args.input.wallet,
    market: args.input.market,
    startingPortfolioValueSol: args.input.startValueSol
  });

  const paperRisk = evaluatePaperRisk({
    config: args.input.config,
    paperPnl
  });

  replacePaperOpenOrders(args.openOrdersPath, filled.orders);

  if (args.eventPath !== undefined) {
    appendRuntimeEvent(args.eventPath, {
      observedAt: runtimeState.latestStep.observedAt,
      type: runtimeState.latestStep.halted ? 'halt_detected' : 'runtime_step',
      summary: runtimeState,
      message: `paper cycle: retained=${cancelReplace.summary.retainedOpenOrderCount} placed=${cancelReplace.summary.placedReplacementOrderCount} fills=${filled.summary.filledOrderCount + filled.summary.partiallyFilledOrderCount} pnl=${paperPnl.totalPaperPnlSol ?? 'unmarked'} paperRisk=${paperRisk.action}`
    });
  }

  return {
    runtimeState,
    cancelReplace: cancelReplace.summary,
    paperFills: filled.summary,
    paperPnl,
    paperRisk,
    paperFeePreset,
    orders: filled.orders
  };
}
