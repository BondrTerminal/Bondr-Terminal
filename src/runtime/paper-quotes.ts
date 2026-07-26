import type { MarketMakerConfig, Venue, WalletConfig } from '../types/config.js';
import type { WalletSnapshot } from '../types/decision.js';
import type { QuoteLevel, QuoteLevelsPlan } from '../quote/levels.js';
import { createPaperOrder, type PaperOrder } from '../execution/order-lifecycle.js';
import type { PaperVenueAdapter } from '../venue/paper-adapter.js';
import { createOpenBookPaperAdapter } from '../venue/openbook-paper.js';
import { runRuntimeStep, type RuntimeStepInput } from './loop.js';
import { summarizeRuntimeStep, writeRuntimeState, appendRuntimeEvent, type RuntimeStateSummary } from './state.js';

export type PaperQuoteVenue = 'openbook' | 'phoenix';

export type PaperQuotePlacementSummary = {
  observedAt: string;
  wallet: {
    name: string;
    pubkey: string;
  };
  venue: PaperQuoteVenue | null;
  requestedLevelCount: number;
  placedOrderCount: number;
  skippedCount: number;
  skippedReasons: string[];
  paperOrderIds: string[];
  liveExecution: false;
  paperOnly: true;
};

export type PaperQuotePlacementResult = {
  summary: PaperQuotePlacementSummary;
  orders: PaperOrder[];
};

export type PaperQuoteAdapterMap = Partial<Record<PaperQuoteVenue, PaperVenueAdapter>>;

const ORDERBOOK_PAPER_VENUES = new Set<string>(['openbook', 'phoenix']);

function defaultAdapters(): PaperQuoteAdapterMap {
  return {
    openbook: createOpenBookPaperAdapter()
  };
}

function pickPaperVenue(configVenues: Venue[], adapters: PaperQuoteAdapterMap): PaperQuoteVenue | null {
  for (const venue of configVenues) {
    if (ORDERBOOK_PAPER_VENUES.has(venue) && adapters[venue as PaperQuoteVenue] !== undefined) {
      return venue as PaperQuoteVenue;
    }
  }
  return null;
}

function orderIdForLevel(args: {
  observedAt: string;
  venue: PaperQuoteVenue;
  walletName: string;
  level: QuoteLevel;
}): string {
  const timestamp = args.observedAt.replace(/[^0-9A-Za-z]/g, '');
  return `${args.venue}-${args.walletName}-${timestamp}-${args.level.side}-${args.level.level}`;
}

function orderSideForLevel(level: QuoteLevel): 'buy' | 'sell' {
  return level.side === 'bid' ? 'buy' : 'sell';
}

export async function placePaperQuotes(args: {
  config: Pick<MarketMakerConfig, 'execution'>;
  wallet: Pick<WalletSnapshot, 'name' | 'pubkey'>;
  quoteLevels: QuoteLevelsPlan;
  adapters?: PaperQuoteAdapterMap;
}): Promise<PaperQuotePlacementResult> {
  const adapters = { ...defaultAdapters(), ...(args.adapters ?? {}) };
  const requestedLevelCount = args.quoteLevels.levels.length;
  const skippedReasons: string[] = [];
  const orders: PaperOrder[] = [];
  const paperOrderIds: string[] = [];

  const venue = pickPaperVenue(args.config.execution.venues, adapters);

  if (args.quoteLevels.skipped) {
    skippedReasons.push(args.quoteLevels.reason);
  }

  if (requestedLevelCount === 0 && !args.quoteLevels.skipped) {
    skippedReasons.push('paper quote placement skipped: no quote levels');
  }

  if (venue === null) {
    const configured = args.config.execution.venues.join(', ') || 'none';
    skippedReasons.push(`paper quote placement skipped: no supported paper orderbook venue configured (${configured})`);
  }

  if (skippedReasons.length === 0 && venue !== null) {
    const adapter = adapters[venue];
    if (adapter === undefined) {
      skippedReasons.push(`paper quote placement skipped: missing ${venue} paper adapter`);
    } else {
      for (const level of args.quoteLevels.levels) {
        const order = createPaperOrder({
          id: orderIdForLevel({
            observedAt: args.quoteLevels.observedAt,
            venue,
            walletName: args.wallet.name,
            level
          }),
          wallet: args.wallet.name,
          side: orderSideForLevel(level),
          price: level.price,
          sizeUi: level.sizeToken,
          now: args.quoteLevels.observedAt
        });
        const placed = await adapter.placePaperOrder(order);
        orders.push(placed);
        paperOrderIds.push(placed.id);
      }
    }
  }

  return {
    summary: {
      observedAt: args.quoteLevels.observedAt,
      wallet: {
        name: args.wallet.name,
        pubkey: args.wallet.pubkey
      },
      venue,
      requestedLevelCount,
      placedOrderCount: orders.length,
      skippedCount: requestedLevelCount - orders.length,
      skippedReasons,
      paperOrderIds,
      liveExecution: false,
      paperOnly: true
    },
    orders
  };
}

export async function runPersistAndPlacePaperQuotes(args: {
  input: RuntimeStepInput;
  statePath: string;
  eventPath?: string;
  adapters?: PaperQuoteAdapterMap;
}): Promise<{
  runtimeState: RuntimeStateSummary;
  paperQuotes: PaperQuotePlacementSummary;
  orders: PaperOrder[];
}> {
  const result = runRuntimeStep(args.input);
  const runtimeState = summarizeRuntimeStep(result, {
    mode: args.input.config.mode,
    wallet: args.input.wallet,
    market: args.input.market
  });
  writeRuntimeState(args.statePath, runtimeState);

  const paperQuoteResult = await placePaperQuotes({
    config: args.input.config,
    wallet: args.input.wallet,
    quoteLevels: result.quoteLevels,
    adapters: args.adapters
  });

  if (args.eventPath !== undefined) {
    appendRuntimeEvent(args.eventPath, {
      observedAt: runtimeState.latestStep.observedAt,
      type: paperQuoteResult.summary.placedOrderCount > 0 ? 'runtime_step' : 'note',
      summary: runtimeState,
      message: `paper quote placement: placed=${paperQuoteResult.summary.placedOrderCount} skipped=${paperQuoteResult.summary.skippedCount}`
    });
  }

  return {
    runtimeState,
    paperQuotes: paperQuoteResult.summary,
    orders: paperQuoteResult.orders
  };
}
