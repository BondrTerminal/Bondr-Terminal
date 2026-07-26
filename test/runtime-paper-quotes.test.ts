import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOpenBookPaperAdapter } from '../src/venue/openbook-paper.js';
import type { PaperVenueAdapter } from '../src/venue/paper-adapter.js';
import type { PaperOrder } from '../src/execution/order-lifecycle.js';
import { placePaperQuotes, runPersistAndPlacePaperQuotes } from '../src/runtime/paper-quotes.js';
import { readRuntimeState, readRuntimeEvents } from '../src/runtime/state.js';
import type { MarketMakerConfig, WalletConfig } from '../src/types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../src/types/decision.js';
import type { QuoteLevelsPlan } from '../src/quote/levels.js';

const walletConfig: WalletConfig = {
  name: 'w1',
  pubkey: 'Wallet11111111111111111111111111111111111111',
  maxSolToUse: 0.2,
  minSolReserve: 0.1,
  maxTokenInventory: 1000,
  targetTokenInventory: 500
};

const config: MarketMakerConfig = {
  mode: 'dry-run',
  cluster: 'mainnet-beta',
  rpcUrlEnv: 'SOLANA_RPC_URL',
  tokenMint: 'Token111111111111111111111111111111111111111',
  quoteMint: 'So11111111111111111111111111111111111111112',
  wallets: [walletConfig],
  globalRisk: {
    maxTotalSolExposure: 1,
    maxTradeSol: 0.05,
    maxTradesPerMinute: 2,
    maxSlippageBps: 100,
    maxDailyLossSol: 0.2,
    killSwitchDrawdownBps: 500,
    maxMarketDataAgeMs: 15000
  },
  quoting: {
    baseSpreadBps: 100,
    minSpreadBps: 50,
    maxSpreadBps: 500,
    inventorySkewBps: 50,
    volatilitySpreadMultiplier: 1,
    minDelayMs: 1000,
    maxDelayMs: 5000
  },
  execution: {
    venues: ['openbook'],
    priorityFeeLamports: 0,
    useJito: false,
    maxRetries: 0
  }
};

const wallet: WalletSnapshot = {
  name: 'w1',
  pubkey: walletConfig.pubkey,
  solBalance: 1,
  tokenBalance: 400
};

const nowMs = Date.parse('2026-07-08T14:24:00.000Z');

const market: MarketSnapshot = {
  observedAt: new Date(nowMs).toISOString(),
  tokenMint: config.tokenMint,
  quoteMint: config.quoteMint,
  referencePrice: 0.001,
  estimatedSlippageBps: 20,
  volatilityBps: 50
};

const quoteLevels: QuoteLevelsPlan = {
  observedAt: '2026-07-08T14:24:00.000Z',
  midPrice: 0.001,
  skipped: false,
  reason: 'quote levels computed',
  levels: [
    { side: 'bid', level: 1, price: 0.00099, sizeSol: 0.01, sizeToken: 10.1010101 },
    { side: 'ask', level: 1, price: 0.00101, sizeSol: 0.01, sizeToken: 9.9009901 }
  ]
};

function liveTrapAdapter(): PaperVenueAdapter & { liveCalls: { place: number; cancel: number } } {
  const adapter = createOpenBookPaperAdapter() as PaperVenueAdapter & { liveCalls: { place: number; cancel: number } };
  adapter.liveCalls = { place: 0, cancel: 0 };
  adapter.placeOrder = async (): Promise<never> => {
    adapter.liveCalls.place += 1;
    throw new Error('live placeOrder must never be called');
  };
  adapter.cancelOrder = async (): Promise<never> => {
    adapter.liveCalls.cancel += 1;
    throw new Error('live cancelOrder must never be called');
  };
  return adapter;
}

test('places paper orders from valid quote levels', async () => {
  const adapter = createOpenBookPaperAdapter();
  const result = await placePaperQuotes({
    config,
    wallet,
    quoteLevels,
    adapters: { openbook: adapter }
  });

  assert.equal(result.summary.venue, 'openbook');
  assert.equal(result.summary.requestedLevelCount, 2);
  assert.equal(result.summary.placedOrderCount, 2);
  assert.equal(result.summary.skippedCount, 0);
  assert.equal(result.summary.liveExecution, false);
  assert.equal(result.summary.paperOnly, true);
  assert.equal(result.orders[0]?.side, 'buy');
  assert.equal(result.orders[1]?.side, 'sell');
  assert.equal(result.orders[0]?.status, 'placed');
  assert.equal(adapter.listPaperOrders().length, 2);
  assert.deepEqual(result.summary.paperOrderIds, result.orders.map((order) => order.id));
});

test('skips when quote levels are skipped', async () => {
  const adapter = createOpenBookPaperAdapter();
  const result = await placePaperQuotes({
    config,
    wallet,
    quoteLevels: {
      observedAt: quoteLevels.observedAt,
      midPrice: null,
      levels: [],
      skipped: true,
      reason: 'quote levels skipped: reference price unavailable'
    },
    adapters: { openbook: adapter }
  });

  assert.equal(result.summary.placedOrderCount, 0);
  assert.equal(result.summary.skippedReasons[0], 'quote levels skipped: reference price unavailable');
  assert.equal(adapter.listPaperOrders().length, 0);
});

test('skips unsupported venues safely', async () => {
  const result = await placePaperQuotes({
    config: { ...config, execution: { ...config.execution, venues: ['jupiter'] } },
    wallet,
    quoteLevels,
    adapters: { openbook: createOpenBookPaperAdapter() }
  });

  assert.equal(result.summary.venue, null);
  assert.equal(result.summary.placedOrderCount, 0);
  assert.equal(result.summary.skippedCount, 2);
  assert.match(result.summary.skippedReasons.join('; '), /no supported paper orderbook venue/);
});

test('never calls live-shaped adapter methods', async () => {
  const adapter = liveTrapAdapter();
  const result = await placePaperQuotes({
    config,
    wallet,
    quoteLevels,
    adapters: { openbook: adapter }
  });

  assert.equal(result.summary.placedOrderCount, 2);
  assert.equal(adapter.liveCalls.place, 0);
  assert.equal(adapter.liveCalls.cancel, 0);
});

test('preserves dry-run and paper-only safety fields in composed helper', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-paper-quotes-'));
  const statePath = path.join(dir, 'state.json');
  const eventPath = path.join(dir, 'events.ndjson');
  const adapter = createOpenBookPaperAdapter();

  const result = await runPersistAndPlacePaperQuotes({
    input: {
      config,
      walletConfig,
      wallet,
      market,
      startedAt: '2026-07-08T14:00:00.000Z',
      startValueSol: 1.4,
      nowMs,
      quoteLevelOptions: { levelCount: 1 }
    },
    statePath,
    eventPath,
    adapters: { openbook: adapter }
  });

  const persisted = readRuntimeState(statePath);
  const events = readRuntimeEvents(eventPath);

  assert.equal(result.runtimeState.latestStep.mode, 'dry-run');
  assert.equal(result.runtimeState.latestStep.execution.executed, false);
  assert.equal(result.paperQuotes.liveExecution, false);
  assert.equal(result.paperQuotes.paperOnly, true);
  assert.equal(result.paperQuotes.placedOrderCount, 2);
  assert.equal(persisted?.latestStep.execution.executed, false);
  assert.equal(events.length, 1);
});

test('handles empty levels without throwing', async () => {
  const result = await placePaperQuotes({
    config,
    wallet,
    quoteLevels: {
      observedAt: quoteLevels.observedAt,
      midPrice: 0.001,
      levels: [],
      skipped: false,
      reason: 'quote levels computed'
    },
    adapters: { openbook: createOpenBookPaperAdapter() }
  });

  assert.equal(result.summary.requestedLevelCount, 0);
  assert.equal(result.summary.placedOrderCount, 0);
  assert.equal(result.summary.skippedCount, 0);
  assert.match(result.summary.skippedReasons.join('; '), /no quote levels/);
  assert.deepEqual(result.orders, [] as PaperOrder[]);
});
