import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPaperOrder, markPlaced, type PaperOrder } from '../src/execution/order-lifecycle.js';
import { cancelReplacePaperOrders, runPaperRuntimeCycle } from '../src/runtime/cancel-replace.js';
import { readPaperOpenOrders, writePaperOpenOrders } from '../src/runtime/open-orders.js';
import { createOpenBookPaperAdapter } from '../src/venue/openbook-paper.js';
import type { PaperVenueAdapter } from '../src/venue/paper-adapter.js';
import type { MarketMakerConfig, WalletConfig } from '../src/types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../src/types/decision.js';
import { buildQuotePlan } from '../src/decision/quote-plan.js';
import { buildQuoteLevels } from '../src/quote/levels.js';

const observedAt = '2026-07-08T14:42:00.000Z';
const oldAt = '2026-07-08T14:40:00.000Z';

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
  tokenBalance: 500
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

function placedOrder(args: {
  id: string;
  side?: 'buy' | 'sell';
  price?: number;
  walletName?: string;
  createdAt?: string;
  status?: PaperOrder['status'];
}): PaperOrder {
  const order = markPlaced(createPaperOrder({
    id: args.id,
    wallet: args.walletName ?? wallet.name,
    side: args.side ?? 'buy',
    price: args.price ?? 1,
    sizeUi: 10,
    now: args.createdAt ?? observedAt
  }), args.createdAt ?? observedAt);
  return args.status === undefined ? order : { ...order, status: args.status };
}

function quoteLevels() {
  const quotePlan = buildQuotePlan({ config, walletConfig, wallet, market });
  return buildQuoteLevels({ config, walletConfig, wallet, quotePlan, options: { levelCount: 1 } });
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

test('stale orders expire and replacement quotes are placed', async () => {
  const result = await cancelReplacePaperOrders({
    config,
    wallet,
    market,
    openOrders: [placedOrder({ id: 'stale', createdAt: oldAt })],
    quoteLevels: quoteLevels(),
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxAgeMs: 1
  });

  assert.equal(result.summary.expiredOrderCount, 1);
  assert.deepEqual(result.summary.expiredPaperOrderIds, ['stale']);
  assert.equal(result.summary.placedReplacementOrderCount, 2);
  assert.equal(result.summary.endingOpenOrderCount, 2);
});

test('crossed or bad paper orders cancel', async () => {
  const result = await cancelReplacePaperOrders({
    config,
    wallet,
    market,
    openOrders: [
      placedOrder({ id: 'bad-buy', side: 'buy', price: 1.2 }),
      placedOrder({ id: 'bad-sell', side: 'sell', price: 0.8 }),
      placedOrder({ id: 'wrong-wallet', walletName: 'w2' })
    ],
    quoteLevels: { ...quoteLevels(), levels: [] },
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCrossBps: 100
  });

  assert.equal(result.summary.cancelledOrderCount, 3);
  assert.deepEqual(result.summary.cancelledPaperOrderIds, ['bad-buy', 'bad-sell', 'wrong-wallet']);
  assert.equal(result.summary.retainedOpenOrderCount, 0);
});

test('non-stale valid orders are retained', async () => {
  const result = await cancelReplacePaperOrders({
    config,
    wallet,
    market,
    openOrders: [
      placedOrder({ id: 'valid-buy', side: 'buy', price: 0.99 }),
      placedOrder({ id: 'valid-sell', side: 'sell', price: 1.01 })
    ],
    quoteLevels: { ...quoteLevels(), levels: [] },
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxAgeMs: 60_000,
    maxCrossBps: 200
  });

  assert.equal(result.summary.cancelledOrderCount, 0);
  assert.equal(result.summary.expiredOrderCount, 0);
  assert.equal(result.summary.retainedOpenOrderCount, 2);
  assert.deepEqual(result.orders.map((order) => order.id), ['valid-buy', 'valid-sell']);
});

test('terminal orders are removed from active state', async () => {
  const result = await cancelReplacePaperOrders({
    config,
    wallet,
    market,
    openOrders: [placedOrder({ id: 'filled', status: 'filled' })],
    quoteLevels: { ...quoteLevels(), levels: [] },
    adapters: { openbook: createOpenBookPaperAdapter() }
  });

  assert.equal(result.summary.skippedCount, 1);
  assert.match(result.summary.skippedReasons.join('; '), /terminal paper order filled/);
  assert.equal(result.summary.endingOpenOrderCount, 0);
});

test('composed paper runtime cycle writes updated open-order state and preserves safety fields', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-cycle-'));
  const openOrdersPath = path.join(dir, 'open-orders.json');
  const statePath = path.join(dir, 'state.json');
  writePaperOpenOrders(openOrdersPath, [placedOrder({ id: 'old-stale', createdAt: oldAt })]);

  const result = await runPaperRuntimeCycle({
    input: {
      config,
      walletConfig,
      wallet,
      market,
      startedAt: '2026-07-08T14:00:00.000Z',
      startValueSol: 1.5,
      nowMs: Date.parse(observedAt),
      quoteLevelOptions: { levelCount: 1 }
    },
    statePath,
    openOrdersPath,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxAgeMs: 1
  });

  assert.equal(result.runtimeState.latestStep.mode, 'dry-run');
  assert.equal(result.runtimeState.latestStep.execution.executed, false);
  assert.equal(result.cancelReplace.liveExecution, false);
  assert.equal(result.cancelReplace.paperOnly, true);
  assert.equal(result.paperFills.liveExecution, false);
  assert.equal(result.paperFills.paperOnly, true);
  assert.equal(result.paperPnl.liveExecution, false);
  assert.equal(result.paperPnl.paperOnly, true);
  assert.equal(result.paperPnl.startingPortfolioValueSol, 1.5);
  assert.equal(result.paperPnl.activeOpenOrderCount, result.orders.filter((order) => order.status === 'placed' || order.status === 'partially-filled').length);
  assert.equal(result.cancelReplace.expiredOrderCount, 1);
  assert.equal(readPaperOpenOrders(openOrdersPath).length, result.orders.length);
});

test('never calls live-shaped adapter methods', async () => {
  const adapter = liveTrapAdapter();
  const result = await cancelReplacePaperOrders({
    config,
    wallet,
    market,
    openOrders: [placedOrder({ id: 'valid-buy', side: 'buy', price: 0.99 })],
    quoteLevels: quoteLevels(),
    adapters: { openbook: adapter }
  });

  assert.equal(result.summary.placedReplacementOrderCount, 1);
  assert.equal(result.summary.placedPaperOrderIds.length, 1);
  assert.equal(adapter.liveCalls.place, 0);
  assert.equal(adapter.liveCalls.cancel, 0);
});
