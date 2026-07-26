import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runRuntimeStep } from '../src/runtime/loop.js';
import type { MarketMakerConfig, WalletConfig } from '../src/types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../src/types/decision.js';

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
    venues: ['jupiter'],
    priorityFeeLamports: 0,
    useJito: false,
    maxRetries: 0
  }
};

const nowMs = Date.parse('2026-07-08T05:55:00.000Z');

const market: MarketSnapshot = {
  observedAt: new Date(nowMs).toISOString(),
  tokenMint: config.tokenMint,
  quoteMint: config.quoteMint,
  referencePrice: 0.001,
  estimatedSlippageBps: 20,
  volatilityBps: 50
};

const wallet: WalletSnapshot = {
  name: 'w1',
  pubkey: walletConfig.pubkey,
  solBalance: 1,
  tokenBalance: 400
};

test('runtime step computes decision, drawdown, quote plan, and quote levels without live execution', () => {
  const result = runRuntimeStep({
    config,
    walletConfig,
    wallet,
    market,
    startedAt: '2026-07-08T05:00:00.000Z',
    startValueSol: 1.4,
    nowMs,
    quoteLevelOptions: { levelCount: 2 }
  });

  assert.equal(result.observedAt, market.observedAt);
  assert.equal(result.halted, false);
  assert.equal(result.risk.passed, true);
  assert.equal(result.drawdown?.action, 'allow');
  assert.equal(result.decision.side, 'buy');
  assert.equal(result.execution.mode, 'dry-run');
  assert.equal(result.execution.executed, false);
  assert.equal(result.quoteLevels.skipped, false);
  assert.equal(result.quoteLevels.levels.length, 4);
  assert.equal(result.skippedReason, null);
});

test('runtime step blocks when existing risk checks fail', () => {
  const result = runRuntimeStep({
    config,
    walletConfig,
    wallet,
    market: { ...market, estimatedSlippageBps: 150 },
    startedAt: '2026-07-08T05:00:00.000Z',
    startValueSol: 1.4,
    nowMs
  });

  assert.equal(result.risk.passed, false);
  assert.equal(result.decision.side, 'wait');
  assert.equal(result.decision.riskPassed, false);
  assert.ok(result.skippedReason?.includes('risk blocked'));
  assert.ok(result.execution.reason.includes('wait'));
});

test('runtime step halts on drawdown kill-switch evaluation', () => {
  const result = runRuntimeStep({
    config,
    walletConfig,
    wallet,
    market,
    startedAt: '2026-07-08T05:00:00.000Z',
    startValueSol: 2,
    nowMs
  });

  assert.equal(result.drawdown?.action, 'halt');
  assert.equal(result.decision.side, 'wait');
  assert.equal(result.decision.riskPassed, false);
  assert.ok(result.skippedReason?.includes('drawdown halt'));
});

test('runtime step skips quote levels when reference price is missing', () => {
  const result = runRuntimeStep({
    config,
    walletConfig,
    wallet,
    market: { ...market, referencePrice: null },
    startedAt: '2026-07-08T05:00:00.000Z',
    startValueSol: 1.4,
    nowMs
  });

  assert.equal(result.quotePlan.midPrice, null);
  assert.equal(result.quoteLevels.skipped, true);
  assert.equal(result.drawdown, null);
  assert.equal(result.decision.side, 'wait');
  assert.ok(result.skippedReason?.includes('risk blocked'));
});

test('runtime step reads HALT file without creating or modifying it and stays dry-run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-runtime-'));
  const haltFile = path.join(dir, 'HALT');
  const missingHaltFile = path.join(dir, 'MISSING-HALT');

  const before = runRuntimeStep({
    config,
    walletConfig,
    wallet,
    market,
    startedAt: '2026-07-08T05:00:00.000Z',
    startValueSol: 1.4,
    nowMs,
    haltFile: missingHaltFile
  });

  assert.equal(before.halted, false);
  assert.equal(fs.existsSync(missingHaltFile), false);

  fs.writeFileSync(haltFile, 'manual halt');
  const priorMtime = fs.statSync(haltFile).mtimeMs;

  const after = runRuntimeStep({
    config,
    walletConfig,
    wallet,
    market,
    startedAt: '2026-07-08T05:00:00.000Z',
    startValueSol: 1.4,
    nowMs,
    haltFile
  });

  assert.equal(after.halted, true);
  assert.equal(after.decision.side, 'wait');
  assert.equal(after.execution.executed, false);
  assert.equal(fs.readFileSync(haltFile, 'utf8'), 'manual halt');
  assert.equal(fs.statSync(haltFile).mtimeMs, priorMtime);
});
