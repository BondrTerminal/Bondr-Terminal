import assert from 'node:assert/strict';
import test from 'node:test';
import type { MarketMakerConfig } from '../src/types/config.js';
import type { WalletSnapshot } from '../src/types/decision.js';
import {
  buildDrawdownCheckpoint,
  evaluateConfigDrawdown,
  evaluateDrawdown,
  totalPortfolioValueSol
} from '../src/risk/drawdown.js';

const config: MarketMakerConfig = {
  mode: 'dry-run',
  cluster: 'mainnet-beta',
  rpcUrlEnv: 'SOLANA_RPC_URL',
  tokenMint: 'Token111111111111111111111111111111111111111',
  quoteMint: 'So11111111111111111111111111111111111111112',
  wallets: [{
    name: 'w1',
    pubkey: 'Wallet11111111111111111111111111111111111111',
    maxSolToUse: 1,
    minSolReserve: 0.1,
    maxTokenInventory: 1000,
    targetTokenInventory: 500
  }],
  globalRisk: {
    maxTotalSolExposure: 1,
    maxTradeSol: 0.1,
    maxTradesPerMinute: 2,
    maxSlippageBps: 100,
    maxDailyLossSol: 0.2,
    killSwitchDrawdownBps: 500,
    maxMarketDataAgeMs: 15000
  },
  quoting: {
    baseSpreadBps: 50,
    minSpreadBps: 20,
    maxSpreadBps: 200,
    inventorySkewBps: 100,
    volatilitySpreadMultiplier: 1.5,
    minDelayMs: 1000,
    maxDelayMs: 10000
  },
  execution: { venues: ['jupiter'], priorityFeeLamports: 0, useJito: false, maxRetries: 0 }
};

const wallets: WalletSnapshot[] = [
  { name: 'w1', pubkey: 'wallet-1', solBalance: 1, tokenBalance: 100 },
  { name: 'w2', pubkey: 'wallet-2', solBalance: 0.5, tokenBalance: 50 }
];

test('totals wallet portfolio value in SOL terms', () => {
  assert.equal(totalPortfolioValueSol({ wallets, tokenPriceSol: 0.01 }), 3);
});

test('returns null portfolio value when token price is unavailable', () => {
  assert.equal(totalPortfolioValueSol({ wallets, tokenPriceSol: null }), null);
});

test('allows portfolio inside drawdown and daily loss limits', () => {
  const result = evaluateDrawdown({
    checkpoint: { startedAt: '2026-07-08T00:00:00.000Z', startValueSol: 10, currentValueSol: 9.8, realizedPnlSol: -0.1 },
    maxDailyLossSol: 0.5,
    killSwitchDrawdownBps: 500
  });

  assert.equal(result.passed, true);
  assert.equal(result.action, 'allow');
  assert.equal(result.drawdownBps, 200);
  assert.deepEqual(result.reasons, []);
});

test('blocks when realized daily loss exceeds maxDailyLossSol', () => {
  const result = evaluateDrawdown({
    checkpoint: { startedAt: '2026-07-08T00:00:00.000Z', startValueSol: 10, currentValueSol: 9.9, realizedPnlSol: -0.25 },
    maxDailyLossSol: 0.2,
    killSwitchDrawdownBps: 500
  });

  assert.equal(result.passed, false);
  assert.equal(result.action, 'block');
  assert.equal(result.dailyLossSol, 0.25);
  assert.ok(result.reasons.some((reason) => reason.includes('daily loss')));
});

test('halts when portfolio drawdown reaches kill-switch bps', () => {
  const result = evaluateDrawdown({
    checkpoint: { startedAt: '2026-07-08T00:00:00.000Z', startValueSol: 10, currentValueSol: 9.5, realizedPnlSol: -0.1 },
    maxDailyLossSol: 1,
    killSwitchDrawdownBps: 500
  });

  assert.equal(result.passed, false);
  assert.equal(result.action, 'halt');
  assert.equal(result.drawdownBps, 500);
  assert.ok(result.reasons.some((reason) => reason.includes('killSwitchDrawdownBps')));
});

test('uses config risk limits for drawdown evaluation', () => {
  const result = evaluateConfigDrawdown({
    config,
    checkpoint: { startedAt: '2026-07-08T00:00:00.000Z', startValueSol: 10, currentValueSol: 9.79 }
  });

  assert.equal(result.passed, false);
  assert.equal(result.action, 'block');
  assert.ok(result.reasons.some((reason) => reason.includes('maxDailyLossSol')));
});

test('builds checkpoint from wallets when reference price exists', () => {
  const checkpoint = buildDrawdownCheckpoint({
    startedAt: '2026-07-08T00:00:00.000Z',
    startValueSol: 3.2,
    wallets,
    tokenPriceSol: 0.01,
    realizedPnlSol: -0.05
  });

  assert.deepEqual(checkpoint, {
    startedAt: '2026-07-08T00:00:00.000Z',
    startValueSol: 3.2,
    currentValueSol: 3,
    realizedPnlSol: -0.05
  });
});

test('does not build checkpoint without a reference price', () => {
  assert.equal(buildDrawdownCheckpoint({
    startedAt: '2026-07-08T00:00:00.000Z',
    startValueSol: 3.2,
    wallets,
    tokenPriceSol: null
  }), null);
});
