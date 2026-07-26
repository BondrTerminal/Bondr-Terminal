import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPaperOrder, markPlaced, type PaperOrder } from '../src/execution/order-lifecycle.js';
import { simulatePaperOrderFills, runPersistPlaceAndFillPaperQuotes } from '../src/runtime/paper-fills.js';
import { createOpenBookPaperAdapter } from '../src/venue/openbook-paper.js';
import type { PaperVenueAdapter } from '../src/venue/paper-adapter.js';
import type { MarketMakerConfig, WalletConfig } from '../src/types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../src/types/decision.js';

const observedAt = '2026-07-08T14:33:00.000Z';

const walletConfig: WalletConfig = {
  name: 'w1',
  pubkey: 'Wallet11111111111111111111111111111111111111',
  maxSolToUse: 0.2,
  minSolReserve: 0.1,
  maxTokenInventory: 1000,
  targetTokenInventory: 500
};

const wallet: WalletSnapshot = {
  name: 'w1',
  pubkey: walletConfig.pubkey,
  solBalance: 1,
  tokenBalance: 400
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

const market: MarketSnapshot = {
  observedAt,
  tokenMint: config.tokenMint,
  quoteMint: config.quoteMint,
  referencePrice: 1,
  estimatedSlippageBps: 5,
  volatilityBps: 50
};

function placedOrder(args: { id: string; side: 'buy' | 'sell'; price: number; sizeUi?: number }): PaperOrder {
  return markPlaced(
    createPaperOrder({
      id: args.id,
      wallet: wallet.name,
      side: args.side,
      price: args.price,
      sizeUi: args.sizeUi ?? 10,
      now: observedAt
    }),
    observedAt
  );
}

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

test('fills eligible buy orders', () => {
  const result = simulatePaperOrderFills({
    orders: [placedOrder({ id: 'buy-cross', side: 'buy', price: 1.01 })],
    market,
    wallet,
    venue: 'openbook'
  });

  assert.equal(result.summary.inspectedOrderCount, 1);
  assert.equal(result.summary.filledOrderCount, 1);
  assert.equal(result.summary.partiallyFilledOrderCount, 0);
  assert.equal(result.summary.openOrderCount, 0);
  assert.deepEqual(result.summary.filledPaperOrderIds, ['buy-cross']);
  assert.equal(result.orders[0]?.status, 'filled');
  assert.equal(result.orders[0]?.filledUi, 10);
});

test('fills eligible sell orders', () => {
  const result = simulatePaperOrderFills({
    orders: [placedOrder({ id: 'sell-cross', side: 'sell', price: 0.99 })],
    market,
    wallet,
    venue: 'openbook'
  });

  assert.equal(result.summary.filledOrderCount, 1);
  assert.deepEqual(result.summary.filledPaperOrderIds, ['sell-cross']);
  assert.equal(result.orders[0]?.status, 'filled');
});

test('leaves non-crossing orders open', () => {
  const result = simulatePaperOrderFills({
    orders: [
      placedOrder({ id: 'buy-open', side: 'buy', price: 0.99 }),
      placedOrder({ id: 'sell-open', side: 'sell', price: 1.01 })
    ],
    market,
    wallet,
    venue: 'openbook'
  });

  assert.equal(result.summary.filledOrderCount, 0);
  assert.equal(result.summary.partiallyFilledOrderCount, 0);
  assert.equal(result.summary.openOrderCount, 2);
  assert.deepEqual(result.summary.filledPaperOrderIds, []);
  assert.deepEqual(result.orders.map((order) => order.status), ['placed', 'placed']);
});

test('supports partial fills', () => {
  const result = simulatePaperOrderFills({
    orders: [placedOrder({ id: 'partial-buy', side: 'buy', price: 1.01, sizeUi: 20 })],
    market,
    wallet,
    venue: 'openbook',
    fillRatio: 0.25
  });

  assert.equal(result.summary.filledOrderCount, 0);
  assert.equal(result.summary.partiallyFilledOrderCount, 1);
  assert.equal(result.summary.openOrderCount, 1);
  assert.deepEqual(result.summary.filledPaperOrderIds, ['partial-buy']);
  assert.equal(result.orders[0]?.status, 'partially-filled');
  assert.equal(result.orders[0]?.filledUi, 5);
});

test('adds deterministic paper fee and slippage accounting to buy fills', () => {
  const result = simulatePaperOrderFills({
    orders: [placedOrder({ id: 'buy-fee', side: 'buy', price: 1.01, sizeUi: 10 })],
    market,
    wallet,
    venue: 'openbook',
    makerFeeBps: 10
  });

  assert.equal(result.summary.filledGrossNotionalSol, 10);
  assert.equal(result.summary.paperFeesSol, 0.01);
  assert.equal(result.summary.paperSlippageSol, -0.1);
  assert.equal(result.summary.filledNetNotionalSol, 10.01);
  assert.equal(result.orders[0]?.paperFillAccounting?.quotedPrice, 1.01);
  assert.equal(result.orders[0]?.paperFillAccounting?.executedPrice, 1);
  assert.equal(result.orders[0]?.paperFillAccounting?.netNotionalSol, 10.01);
});

test('adds deterministic paper fee and slippage accounting to sell fills', () => {
  const result = simulatePaperOrderFills({
    orders: [placedOrder({ id: 'sell-fee', side: 'sell', price: 0.99, sizeUi: 10 })],
    market,
    wallet,
    venue: 'openbook',
    makerFeeBps: 10
  });

  assert.equal(result.summary.filledGrossNotionalSol, 10);
  assert.equal(result.summary.paperFeesSol, 0.01);
  assert.equal(result.summary.paperSlippageSol, -0.1);
  assert.equal(result.summary.filledNetNotionalSol, 9.99);
  assert.equal(result.orders[0]?.paperFillAccounting?.quotedPrice, 0.99);
  assert.equal(result.orders[0]?.paperFillAccounting?.executedPrice, 1);
  assert.equal(result.orders[0]?.paperFillAccounting?.netNotionalSol, 9.99);
});

test('handles empty order list without throwing', () => {
  const result = simulatePaperOrderFills({
    orders: [],
    market,
    wallet,
    venue: 'openbook'
  });

  assert.equal(result.summary.inspectedOrderCount, 0);
  assert.equal(result.summary.filledOrderCount, 0);
  assert.equal(result.summary.openOrderCount, 0);
  assert.equal(result.summary.skippedCount, 0);
  assert.deepEqual(result.orders, []);
});

test('skips safely when market reference price is null', () => {
  const result = simulatePaperOrderFills({
    orders: [placedOrder({ id: 'no-price', side: 'buy', price: 1.01 })],
    market: { observedAt, referencePrice: null },
    wallet,
    venue: 'openbook'
  });

  assert.equal(result.summary.filledOrderCount, 0);
  assert.equal(result.summary.openOrderCount, 1);
  assert.equal(result.summary.skippedCount, 1);
  assert.match(result.summary.skippedReasons.join('; '), /reference price is unavailable/);
  assert.equal(result.orders[0]?.status, 'placed');
});

test('preserves dry-run and paper-only safety fields in composed helper', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-paper-fills-'));
  const statePath = path.join(dir, 'state.json');
  const adapter = createOpenBookPaperAdapter();

  const result = await runPersistPlaceAndFillPaperQuotes({
    input: {
      config,
      walletConfig,
      wallet,
      market,
      startedAt: '2026-07-08T14:00:00.000Z',
      startValueSol: 1.4,
      nowMs: Date.parse(observedAt),
      quoteLevelOptions: { levelCount: 1 }
    },
    statePath,
    adapters: { openbook: adapter }
  });

  assert.equal(result.runtimeState.latestStep.mode, 'dry-run');
  assert.equal(result.runtimeState.latestStep.execution.executed, false);
  assert.equal(result.paperQuotes.liveExecution, false);
  assert.equal(result.paperQuotes.paperOnly, true);
  assert.equal(result.paperFills.liveExecution, false);
  assert.equal(result.paperFills.paperOnly, true);
  assert.equal(result.paperFills.inspectedOrderCount, result.paperQuotes.placedOrderCount);
});

test('never calls live-shaped adapter methods', async () => {
  const adapter = liveTrapAdapter();

  const result = await runPersistPlaceAndFillPaperQuotes({
    input: {
      config,
      walletConfig,
      wallet,
      market,
      startedAt: '2026-07-08T14:00:00.000Z',
      startValueSol: 1.4,
      nowMs: Date.parse(observedAt),
      quoteLevelOptions: { levelCount: 1 }
    },
    statePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mm-paper-fills-live-trap-')), 'state.json'),
    adapters: { openbook: adapter }
  });

  assert.equal(result.paperQuotes.placedOrderCount, 2);
  assert.equal(adapter.liveCalls.place, 0);
  assert.equal(adapter.liveCalls.cancel, 0);
});
