import assert from 'node:assert/strict';
import test from 'node:test';
import { configSchema } from '../src/config/schema.js';

const validConfig = {
  mode: 'dry-run',
  cluster: 'mainnet-beta',
  rpcUrlEnv: 'SOLANA_RPC_URL',
  tokenMint: 'Token111111111111111111111111111111111111111',
  quoteMint: 'So11111111111111111111111111111111111111112',
  wallets: [{
    name: 'w1',
    pubkey: 'Wallet11111111111111111111111111111111111111',
    maxSolToUse: 0.1,
    minSolReserve: 0.01,
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
    baseSpreadBps: 100,
    minSpreadBps: 50,
    maxSpreadBps: 500,
    inventorySkewBps: 100,
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

test('accepts valid dry-run config', () => {
  const parsed = configSchema.parse(validConfig);
  assert.equal(parsed.mode, 'dry-run');
});

test('rejects live mode in foundation v0', () => {
  const result = configSchema.safeParse({ ...validConfig, mode: 'live' });
  assert.equal(result.success, false);
});

test('rejects maxTradeSol above total exposure', () => {
  const result = configSchema.safeParse({
    ...validConfig,
    globalRisk: { ...validConfig.globalRisk, maxTotalSolExposure: 0.01, maxTradeSol: 0.02 }
  });
  assert.equal(result.success, false);
});

test('rejects inverted spread range', () => {
  const result = configSchema.safeParse({
    ...validConfig,
    quoting: { ...validConfig.quoting, minSpreadBps: 1000, maxSpreadBps: 100 }
  });
  assert.equal(result.success, false);
});
