import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readPaperSessionReport, createPaperSessionReport, writePaperSessionReport } from '../src/runtime/paper-session-report.js';
import { runBoundedPaperRunner } from '../src/runtime/paper-runner.js';
import { createOpenBookPaperAdapter } from '../src/venue/openbook-paper.js';
import type { RuntimeStepInput } from '../src/runtime/loop.js';
import type { MarketMakerConfig, WalletConfig } from '../src/types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../src/types/decision.js';

const observedAt = '2026-07-11T20:43:00.000Z';

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
  rpcUrlEnv: 'SOLANA_RPC_URL_SHOULD_NOT_APPEAR',
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

function tempPaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-report-'));
  return {
    statePath: path.join(dir, 'runtime', 'state.json'),
    openOrdersPath: path.join(dir, 'runtime', 'open-orders.json'),
    eventPath: path.join(dir, 'runtime', 'events.ndjson'),
    reportPath: path.join(dir, 'runtime', 'paper-session-report.json')
  };
}

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

function assertNoSecrets(value: unknown): void {
  const raw = JSON.stringify(value);
  assert.doesNotMatch(raw, /privateKey|secretKey|seed|mnemonic|signer|apiKey|rpcUrl|env|SOLANA_RPC_URL/i);
}

test('creates a safe paper session report from a bounded runner result', async () => {
  const paths = tempPaths();
  const result = await runBoundedPaperRunner({
    inputs: [inputAt(0), inputAt(1000)],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 2,
    fillRatio: 1,
    makerFeeBps: 10
  });

  const report = createPaperSessionReport(result);

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.executedCycleCount, 2);
  assert.equal(report.totals.filledOrderCount, result.summary.totalFilledOrderCount);
  assert.equal(report.final.paperPnl?.paperOnly, true);
  assert.equal(report.final.paperRisk?.liveExecution, false);
  assert.equal(report.final.spreadCapture?.paperOnly, true);
  assert.equal(report.cycles.length, 2);
  assert.equal(report.cycles[0].paperOnly, true);
  assertNoSecrets(report);
});

test('writes and reads a report JSON file under runtime path', async () => {
  const paths = tempPaths();
  const result = await runBoundedPaperRunner({
    inputs: [inputAt(0)],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 1,
    fillRatio: 1
  });
  const report = createPaperSessionReport(result);

  writePaperSessionReport(paths.reportPath, report);
  const readBack = readPaperSessionReport(paths.reportPath);

  assert.deepEqual(readBack, report);
  assert.ok(paths.reportPath.includes(`${path.sep}runtime${path.sep}`));
  assertNoSecrets(readBack);
});

test('runBoundedPaperRunner writes reportPath when provided', async () => {
  const paths = tempPaths();
  const result = await runBoundedPaperRunner({
    inputs: [inputAt(0)],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 1,
    fillRatio: 1
  });
  const report = readPaperSessionReport(paths.reportPath);

  assert.equal(report?.executedCycleCount, result.summary.executedCycleCount);
  assert.equal(report?.totals.finalOpenOrderCount, result.summary.finalOpenOrderCount);
  assert.equal(report?.paperOnly, true);
  assert.equal(report?.liveExecution, false);
});

test('exports a deterministic empty-session report', async () => {
  const paths = tempPaths();
  const result = await runBoundedPaperRunner({
    inputs: [],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 2
  });
  const report = readPaperSessionReport(paths.reportPath);

  assert.equal(result.summary.executedCycleCount, 0);
  assert.equal(report?.generatedAt, null);
  assert.equal(report?.executedCycleCount, 0);
  assert.equal(report?.cycles.length, 0);
  assert.equal(report?.final.paperPnl, null);
  assert.equal(report?.final.paperRisk, null);
  assert.equal(report?.final.spreadCapture, null);
  assert.equal(report?.paperOnly, true);
  assertNoSecrets(report);
});

test('captures stopped sessions and skipped reasons safely', async () => {
  const paths = tempPaths();
  const staleInput = inputAt(60_000, {
    market: marketAt(0),
    nowMs: Date.parse(observedAt) + 60_000
  });

  await runBoundedPaperRunner({
    inputs: [staleInput, inputAt(61_000)],
    ...paths,
    adapters: { openbook: createOpenBookPaperAdapter() },
    maxCycles: 2
  });
  const report = readPaperSessionReport(paths.reportPath);

  assert.equal(report?.executedCycleCount, 1);
  assert.equal(report?.stoppedReason, 'stopped after cycle 0: risk blocked');
  assert.ok(report?.skippedReasons.some((reason) => reason.includes('market data stale')));
  assertNoSecrets(report);
});

test('missing report file returns null', () => {
  const paths = tempPaths();
  assert.equal(readPaperSessionReport(paths.reportPath), null);
});
