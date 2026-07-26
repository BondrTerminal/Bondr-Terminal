import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runBoundedPaperRunner } from '../src/runtime/paper-runner.js';
import { readPaperOpenOrders } from '../src/runtime/open-orders.js';
import { readRuntimeEvents } from '../src/runtime/state.js';
import { createOpenBookPaperAdapter } from '../src/venue/openbook-paper.js';
import type { PaperVenueAdapter } from '../src/venue/paper-adapter.js';
import type { RuntimeStepInput } from '../src/runtime/loop.js';
import type { MarketMakerConfig, WalletConfig } from '../src/types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../src/types/decision.js';

const observedAt = '2026-07-08T21:40:00.000Z';

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

function marketAt(offsetMs: number, referencePrice = 1): MarketSnapshot {
  return {
    observedAt: new Date(Date.parse(observedAt) + offsetMs).toISOString(),
    tokenMint: config.tokenMint,
    quoteMint: config.quoteMint,
    referencePrice,
    estimatedSlippageBps: 5,
    volatilityBps: 50
  };
}

function inputAt(offsetMs: number, overrides: Partial<RuntimeStepInput> = {}): RuntimeStepInput {
  return {
    config,
    walletConfig,
    wallet,
    market: marketAt(offsetMs),
    startedAt: observedAt,
    startValueSol: 501,
    nowMs: Date.parse(observedAt) + offsetMs,
    quoteLevelOptions: { levelCount: 1 },
    ...overrides
  };
}

function tempPaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-runner-'));
  return {
    statePath: path.join(dir, 'state.json'),
    openOrdersPath: path.join(dir, 'open-orders.json'),
    eventPath: path.join(dir, 'events.ndjson')
  };
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

test('runs an explicit bounded number of paper cycles and summarizes totals', async () => {
  const paths = tempPaths();
  const result = await runBoundedPaperRunner({
    inputs: [inputAt(0), inputAt(1000)],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 2,
    fillRatio: 1
  });

  assert.equal(result.summary.requestedCycleCount, 2);
  assert.equal(result.summary.executedCycleCount, 2);
  assert.equal(result.summary.stoppedReason, null);
  assert.equal(result.summary.paperOnly, true);
  assert.equal(result.summary.liveExecution, false);
  assert.equal(result.cycles.length, 2);
  assert.equal(result.cycles[0].cycleIndex, 0);
  assert.equal(result.cycles[1].cycleIndex, 1);
  assert.equal(result.summary.totalPlacedOrderCount, result.cycles.reduce((sum, cycle) => sum + cycle.cancelReplace.placedReplacementOrderCount, 0));
  assert.equal(result.summary.finalOpenOrderCount, readPaperOpenOrders(paths.openOrdersPath).length);
  assert.equal(result.summary.finalSpreadCapture?.paperOnly, true);
  assert.equal(result.summary.finalSpreadCapture?.liveExecution, false);
  assert.equal(result.cycles[0].spreadCapture.paperOnly, true);
  assert.ok(readRuntimeEvents(paths.eventPath).some((event) => event.type === 'note'));
});

test('caps execution at maxCycles without daemon behavior', async () => {
  const paths = tempPaths();
  const result = await runBoundedPaperRunner({
    inputs: [inputAt(0), inputAt(1000), inputAt(2000)],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 2
  });

  assert.equal(result.summary.requestedCycleCount, 3);
  assert.equal(result.summary.executedCycleCount, 2);
  assert.equal(result.summary.stoppedReason, 'stopped at maxCycles=2');
});

test('stops on risk block by default', async () => {
  const paths = tempPaths();
  const staleInput = inputAt(60_000, {
    market: marketAt(0),
    nowMs: Date.parse(observedAt) + 60_000
  });

  const result = await runBoundedPaperRunner({
    inputs: [staleInput, inputAt(61_000)],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 2
  });

  assert.equal(result.summary.executedCycleCount, 1);
  assert.equal(result.summary.stoppedReason, 'stopped after cycle 0: risk blocked');
});

test('stops on paper risk block or halt by default', async () => {
  const paths = tempPaths();
  const lossInput = inputAt(0, {
    market: marketAt(0, 0.9),
    startValueSol: 501
  });

  const result = await runBoundedPaperRunner({
    inputs: [lossInput, inputAt(1000)],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 2,
    stopOnDrawdownBlock: false
  });

  assert.equal(result.summary.executedCycleCount, 1);
  assert.equal(result.summary.stoppedReason, 'stopped after cycle 0: paper risk halt');
  assert.equal(result.summary.finalPaperRisk?.action, 'halt');
  assert.equal(result.cycles[0].paperRisk.paperOnly, true);
  assert.equal(result.cycles[0].paperRisk.liveExecution, false);
});

test('can continue through paper risk when explicitly configured', async () => {
  const paths = tempPaths();
  const lossInput = inputAt(0, {
    market: marketAt(0, 0.9),
    startValueSol: 501
  });

  const result = await runBoundedPaperRunner({
    inputs: [lossInput, inputAt(1000)],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 2,
    stopOnDrawdownBlock: false,
    stopOnPaperRiskBlock: false
  });

  assert.equal(result.summary.executedCycleCount, 2);
});

test('can continue through risk block when explicitly configured', async () => {
  const paths = tempPaths();
  const staleInput = inputAt(60_000, {
    market: marketAt(0),
    nowMs: Date.parse(observedAt) + 60_000
  });

  const result = await runBoundedPaperRunner({
    inputs: [staleInput, inputAt(61_000)],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 2,
    stopOnRiskBlock: false
  });

  assert.equal(result.summary.executedCycleCount, 2);
});

test('rejects non-positive maxCycles', async () => {
  const paths = tempPaths();
  await assert.rejects(
    runBoundedPaperRunner({
      inputs: [inputAt(0)],
      ...paths,
      adapters: { openbook: createOpenBookPaperAdapter() },
      maxCycles: 0
    }),
    /maxCycles must be a positive integer/
  );
});

test('never calls live-shaped adapter methods', async () => {
  const paths = tempPaths();
  const adapter = liveTrapAdapter();
  const result = await runBoundedPaperRunner({
    inputs: [inputAt(0), inputAt(1000)],
    ...paths,
    adapters: { openbook: adapter },
    maxCycles: 2
  });

  assert.equal(result.summary.executedCycleCount, 2);
  assert.equal(adapter.liveCalls.place, 0);
  assert.equal(adapter.liveCalls.cancel, 0);
});

test('summarizes fee-adjusted spread capture from bounded paper cycle fills', async () => {
  const paths = tempPaths();
  const result = await runBoundedPaperRunner({
    inputs: [inputAt(0)],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 1,
    fillRatio: 1,
    makerFeeBps: 10
  });

  assert.equal(result.summary.finalSpreadCapture?.matchedSizeUi, 0);
  assert.equal(result.summary.finalSpreadCapture?.totalFeesSol, result.summary.finalPaperPnl?.paperFeesSol);
  assert.equal(result.summary.finalSpreadCapture?.skippedCount, 0);
});

test('does not return raw config, secrets, or signer-shaped fields', async () => {
  const paths = tempPaths();
  const result = await runBoundedPaperRunner({
    inputs: [inputAt(0)],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 1
  });

  const raw = JSON.stringify(result.summary);
  assert.doesNotMatch(raw, /privateKey|secretKey|seed|mnemonic|signer|apiKey|rpcUrl|env/i);
});
