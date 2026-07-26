import assert from 'node:assert/strict';
import test from 'node:test';
import type { MarketMakerConfig } from '../src/types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../src/types/decision.js';
import { runRiskChecks } from '../src/risk/checks.js';

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
    maxDailyLossSol: 0.1,
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

const market: MarketSnapshot = {
  observedAt: new Date().toISOString(),
  tokenMint: config.tokenMint,
  quoteMint: config.quoteMint,
  referencePrice: 0.001,
  estimatedSlippageBps: 50,
  volatilityBps: 20
};

const wallet: WalletSnapshot = {
  name: 'w1',
  pubkey: config.wallets[0]!.pubkey,
  solBalance: 0.5,
  tokenBalance: 500
};

test('passes basic dry-run risk checks', () => {
  const result = runRiskChecks({ config, market, wallet, walletConfig: config.wallets[0]!, proposedSizeSol: 0.05 });
  assert.equal(result.passed, true);
});

test('blocks oversized trades', () => {
  const result = runRiskChecks({ config, market, wallet, walletConfig: config.wallets[0]!, proposedSizeSol: 0.5 });
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((reason) => reason.includes('exceeds maxTradeSol')));
});

test('blocks missing reference price', () => {
  const result = runRiskChecks({
    config,
    market: { ...market, referencePrice: null },
    wallet,
    walletConfig: config.wallets[0]!,
    proposedSizeSol: 0.05
  });
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((reason) => reason.includes('reference price unavailable')));
});

test('blocks stale market data', () => {
  const result = runRiskChecks({
    config,
    market: { ...market, observedAt: '2026-07-05T21:00:00.000Z' },
    wallet,
    walletConfig: config.wallets[0]!,
    proposedSizeSol: 0.05,
    nowMs: Date.parse('2026-07-05T21:01:00.000Z')
  });
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((reason) => reason.includes('market data stale')));
});
