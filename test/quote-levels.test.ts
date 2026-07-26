import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuotePlan } from '../src/decision/quote-plan.js';
import { buildQuoteLevels } from '../src/quote/levels.js';
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
    maxTradeSol: 0.06,
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

const market: MarketSnapshot = {
  observedAt: new Date().toISOString(),
  tokenMint: config.tokenMint,
  quoteMint: config.quoteMint,
  referencePrice: 0.001,
  estimatedSlippageBps: 20,
  volatilityBps: 50
};

function quotePlanFor(wallet: WalletSnapshot) {
  return buildQuotePlan({ config, walletConfig, wallet, market });
}

test('builds symmetric bid and ask quote levels from a valid quote plan', () => {
  const wallet: WalletSnapshot = { name: 'w1', pubkey: walletConfig.pubkey, solBalance: 1, tokenBalance: 500 };
  const levels = buildQuoteLevels({
    config,
    walletConfig,
    wallet,
    quotePlan: quotePlanFor(wallet),
    options: { levelCount: 3, levelSpacingBps: 25 }
  });

  assert.equal(levels.skipped, false);
  assert.equal(levels.levels.length, 6);

  const bids = levels.levels.filter((level) => level.side === 'bid');
  const asks = levels.levels.filter((level) => level.side === 'ask');
  assert.equal(bids.length, 3);
  assert.equal(asks.length, 3);

  assert.ok(bids[0]!.price > bids[1]!.price);
  assert.ok(bids[1]!.price > bids[2]!.price);
  assert.ok(asks[0]!.price < asks[1]!.price);
  assert.ok(asks[1]!.price < asks[2]!.price);

  assert.ok(bids.every((level) => level.price < market.referencePrice!));
  assert.ok(asks.every((level) => level.price > market.referencePrice!));
});

test('clamps bid size by spendable SOL reserve and maxTradeSol', () => {
  const wallet: WalletSnapshot = { name: 'w1', pubkey: walletConfig.pubkey, solBalance: 0.13, tokenBalance: 500 };
  const levels = buildQuoteLevels({
    config,
    walletConfig,
    wallet,
    quotePlan: quotePlanFor(wallet),
    options: { levelCount: 3, totalBidSizeSol: 1 }
  });

  const totalBidSize = levels.levels
    .filter((level) => level.side === 'bid')
    .reduce((sum, level) => sum + level.sizeSol, 0);

  assert.ok(totalBidSize <= 0.03 + Number.EPSILON);
});

test('limits ask levels by available token inventory', () => {
  const wallet: WalletSnapshot = { name: 'w1', pubkey: walletConfig.pubkey, solBalance: 1, tokenBalance: 2 };
  const levels = buildQuoteLevels({
    config,
    walletConfig,
    wallet,
    quotePlan: quotePlanFor(wallet),
    options: { levelCount: 3, totalAskSizeSol: 1 }
  });

  const totalAskTokens = levels.levels
    .filter((level) => level.side === 'ask')
    .reduce((sum, level) => sum + level.sizeToken, 0);

  assert.ok(totalAskTokens <= wallet.tokenBalance + Number.EPSILON);
});

test('skips quote levels when reference price is unavailable', () => {
  const wallet: WalletSnapshot = { name: 'w1', pubkey: walletConfig.pubkey, solBalance: 1, tokenBalance: 500 };
  const quotePlan = buildQuotePlan({
    config,
    walletConfig,
    wallet,
    market: { ...market, referencePrice: null }
  });

  const levels = buildQuoteLevels({ config, walletConfig, wallet, quotePlan });
  assert.equal(levels.skipped, true);
  assert.equal(levels.levels.length, 0);
  assert.ok(levels.reason.includes('reference price unavailable'));
});

test('skips quote levels when level count is zero', () => {
  const wallet: WalletSnapshot = { name: 'w1', pubkey: walletConfig.pubkey, solBalance: 1, tokenBalance: 500 };
  const levels = buildQuoteLevels({
    config,
    walletConfig,
    wallet,
    quotePlan: quotePlanFor(wallet),
    options: { levelCount: 0 }
  });

  assert.equal(levels.skipped, true);
  assert.equal(levels.levels.length, 0);
  assert.ok(levels.reason.includes('levelCount'));
});
