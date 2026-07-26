import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runRuntimeStep } from '../src/runtime/loop.js';
import {
  appendRuntimeEvent,
  readRuntimeEvents,
  readRuntimeState,
  runAndPersistRuntimeStep,
  summarizeRuntimeStep,
  writeRuntimeState
} from '../src/runtime/state.js';
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
  rpcUrlEnv: 'SECRET_RPC_ENV_NAME_SHOULD_NOT_PERSIST',
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

const nowMs = Date.parse('2026-07-08T13:58:00.000Z');

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

function buildResult() {
  return runRuntimeStep({
    config,
    walletConfig,
    wallet,
    market,
    startedAt: '2026-07-08T13:00:00.000Z',
    startValueSol: 1.4,
    nowMs,
    quoteLevelOptions: { levelCount: 2 }
  });
}

test('summarizes runtime step into a safe latest state shape', () => {
  const result = buildResult();
  const summary = summarizeRuntimeStep(result, { mode: config.mode, wallet, market });

  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.latestStep.mode, 'dry-run');
  assert.equal(summary.latestStep.wallet.name, 'w1');
  assert.equal(summary.latestStep.wallet.pubkey, wallet.pubkey);
  assert.equal(summary.latestStep.market.referencePrice, 0.001);
  assert.equal(summary.latestStep.risk.passed, true);
  assert.equal(summary.latestStep.drawdown.action, 'allow');
  assert.equal(summary.latestStep.quoteLevels.count, 4);
  assert.equal(summary.latestStep.decision.side, 'buy');
  assert.equal(summary.latestStep.execution.executed, false);
  assert.equal(summary.latestStep.execution.signature, null);
});

test('writes and reads latest runtime state JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-state-'));
  const statePath = path.join(dir, 'runtime', 'state.json');
  const summary = summarizeRuntimeStep(buildResult(), { mode: config.mode, wallet, market });

  writeRuntimeState(statePath, summary);
  const readBack = readRuntimeState(statePath);

  assert.deepEqual(readBack, summary);
  assert.equal(fs.existsSync(`${statePath}.${process.pid}.tmp`), false);
});

test('appends and reads runtime events as NDJSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-events-'));
  const eventPath = path.join(dir, 'runtime-events.ndjson');
  const summary = summarizeRuntimeStep(buildResult(), { mode: config.mode, wallet, market });

  appendRuntimeEvent(eventPath, {
    observedAt: summary.latestStep.observedAt,
    type: 'runtime_step',
    summary,
    message: 'paper-safe runtime step persisted'
  });
  appendRuntimeEvent(eventPath, {
    observedAt: summary.latestStep.observedAt,
    type: 'note',
    message: 'second event'
  });

  const events = readRuntimeEvents(eventPath);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.type, 'runtime_step');
  assert.equal(events[1]?.message, 'second event');
});

test('runtime events can carry transaction retry/pass decisions for the live feed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-tx-events-'));
  const eventPath = path.join(dir, 'runtime-events.ndjson');

  appendRuntimeEvent(eventPath, {
    observedAt: market.observedAt,
    type: 'transaction_retry',
    message: 'transaction failed: blockhash expired; retry attempt 1/2 in 500ms'
  });
  appendRuntimeEvent(eventPath, {
    observedAt: market.observedAt,
    type: 'transaction_pass',
    message: 'transaction failed: slippage exceeded; pass and rebuild quote'
  });

  const events = readRuntimeEvents(eventPath);
  assert.equal(events[0]?.type, 'transaction_retry');
  assert.equal(events[1]?.type, 'transaction_pass');
});

test('persisted state excludes raw config, env names, secrets, and signer-shaped fields', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-sensitive-'));
  const statePath = path.join(dir, 'state.json');
  const summary = runAndPersistRuntimeStep({
    input: {
      config,
      walletConfig,
      wallet,
      market,
      startedAt: '2026-07-08T13:00:00.000Z',
      startValueSol: 1.4,
      nowMs
    },
    statePath
  });

  const persisted = fs.readFileSync(statePath, 'utf8');
  assert.equal(summary.latestStep.execution.executed, false);
  assert.doesNotMatch(persisted, /SECRET_RPC_ENV_NAME_SHOULD_NOT_PERSIST/);
  assert.doesNotMatch(persisted, /rpcUrlEnv/);
  assert.doesNotMatch(persisted, /globalRisk/);
  assert.doesNotMatch(persisted, /privateKey/i);
  assert.doesNotMatch(persisted, /secretKey/i);
  assert.doesNotMatch(persisted, /seedPhrase/i);
  assert.doesNotMatch(persisted, /apiKey/i);
  assert.doesNotMatch(persisted, /signer/i);
});

test('missing runtime state and event files return safe empty values', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-missing-'));

  assert.equal(readRuntimeState(path.join(dir, 'missing-state.json')), null);
  assert.deepEqual(readRuntimeEvents(path.join(dir, 'missing-events.ndjson')), []);
});
