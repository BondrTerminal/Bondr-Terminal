import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { MarketMakerConfig } from '../src/types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../src/types/decision.js';
import {
  buildObservedPaperRuntimeInput,
  createObservedPaperSessionReport
} from '../src/runtime/observed-paper-session.js';
import { readPaperSessionReport } from '../src/runtime/paper-session-report.js';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mm-observed-paper-'));
}

const config: MarketMakerConfig = {
  mode: 'dry-run',
  cluster: 'mainnet-beta',
  rpcUrlEnv: 'OBSERVED_PAPER_RPC_ENV_SHOULD_NOT_APPEAR',
  tokenMint: 'ObservedToken11111111111111111111111111111111',
  quoteMint: 'So11111111111111111111111111111111111111112',
  wallets: [{
    name: 'observed-wallet',
    pubkey: 'ObservedWallet1111111111111111111111111111111',
    maxSolToUse: 0.2,
    minSolReserve: 0.1,
    maxTokenInventory: 1_000,
    targetTokenInventory: 100
  }],
  globalRisk: {
    maxTotalSolExposure: 1,
    maxTradeSol: 0.05,
    maxTradesPerMinute: 10,
    maxSlippageBps: 100,
    maxDailyLossSol: 20,
    killSwitchDrawdownBps: 1_000,
    maxMarketDataAgeMs: 15_000
  },
  quoting: {
    baseSpreadBps: 100,
    minSpreadBps: 50,
    maxSpreadBps: 500,
    inventorySkewBps: 50,
    volatilitySpreadMultiplier: 1,
    minDelayMs: 1_000,
    maxDelayMs: 5_000
  },
  execution: {
    venues: ['openbook'],
    priorityFeeLamports: 0,
    useJito: false,
    maxRetries: 0
  }
};

const wallet: WalletSnapshot = {
  name: 'observed-wallet',
  pubkey: 'ObservedWallet1111111111111111111111111111111',
  solBalance: 1,
  tokenBalance: 100
};

const market: MarketSnapshot = {
  observedAt: '2026-07-18T18:10:00.000Z',
  tokenMint: config.tokenMint,
  quoteMint: config.quoteMint,
  referencePrice: 0.01,
  estimatedSlippageBps: 5,
  volatilityBps: 20
};

function assertNoSecrets(value: unknown): void {
  const raw = JSON.stringify(value);
  assert.doesNotMatch(raw, /privateKey|secretKey|seed|mnemonic|signer|apiKey|rpcUrl|env|OBSERVED_PAPER_RPC_ENV/i);
}

test('builds a paper runtime input from read-only observed snapshots', () => {
  const input = buildObservedPaperRuntimeInput({
    config,
    walletConfig: config.wallets[0],
    wallet,
    market
  });

  assert.equal(input.startedAt, market.observedAt);
  assert.equal(input.nowMs, Date.parse(market.observedAt));
  assert.equal(input.startValueSol, 2);
  assert.equal(input.quoteLevelOptions?.levelCount, 1);
  assert.equal(input.config.mode, 'dry-run');
});

test('observed paper runtime input refuses live mode', () => {
  assert.throws(() => buildObservedPaperRuntimeInput({
    config: { ...config, mode: 'live' },
    walletConfig: config.wallets[0],
    wallet,
    market
  }), /refuse live mode/);
});

test('creates a multi-cycle safe paper report from read-only observed snapshots', async () => {
  const baseDir = tempDir();
  const { report, result } = await createObservedPaperSessionReport({
    config,
    wallets: [wallet],
    markets: [market, { ...market, observedAt: '2026-07-18T18:10:03.000Z', referencePrice: 0.011 }],
    options: { baseDir, makerFeeBps: 8 }
  });

  assert.equal(report.executedCycleCount, 2);
  assert.equal(report.requestedCycleCount, 2);
  assert.equal(report.generatedAt, '2026-07-18T18:10:03.000Z');
  assert.equal(result.cycles.length, 2);
  assert.equal(report.paperOnly, true);
  assert.equal(report.liveExecution, false);
  assertNoSecrets(report);
});

test('creates a safe paper report from read-only observed snapshots', async () => {
  const baseDir = tempDir();
  const { paths, report, result } = await createObservedPaperSessionReport({
    config,
    wallets: [wallet],
    market,
    options: { baseDir, makerFeeBps: 8 }
  });
  const readBack = readPaperSessionReport(paths.reportPath);

  assert.equal(paths.reportPath, path.join(baseDir, 'runtime', 'paper-session-report.json'));
  assert.equal(fs.existsSync(paths.statePath), true);
  assert.equal(fs.existsSync(paths.openOrdersPath), true);
  assert.equal(fs.existsSync(paths.eventPath), true);
  assert.deepEqual(readBack, report);
  assert.equal(report.generatedAt, market.observedAt);
  assert.equal(report.executedCycleCount, 1);
  assert.equal(report.paperOnly, true);
  assert.equal(report.liveExecution, false);
  assert.equal(result.summary.paperOnly, true);
  assertNoSecrets(report);
});
