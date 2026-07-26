import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuotePlan } from '../src/decision/quote-plan.js';
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

test('builds valid bid and ask around mid price', () => {
  const wallet: WalletSnapshot = { name: 'w1', pubkey: walletConfig.pubkey, solBalance: 1, tokenBalance: 500 };
  const plan = buildQuotePlan({ config, walletConfig, wallet, market });
  assert.ok(plan.bidPrice !== null && plan.askPrice !== null);
  assert.ok(plan.bidPrice < market.referencePrice!);
  assert.ok(plan.askPrice > market.referencePrice!);
});

test('above-target inventory lowers ask relative to neutral plan', () => {
  const neutralWallet: WalletSnapshot = { name: 'w1', pubkey: walletConfig.pubkey, solBalance: 1, tokenBalance: 500 };
  const heavyWallet: WalletSnapshot = { name: 'w1', pubkey: walletConfig.pubkey, solBalance: 1, tokenBalance: 750 };
  const neutral = buildQuotePlan({ config, walletConfig, wallet: neutralWallet, market });
  const heavy = buildQuotePlan({ config, walletConfig, wallet: heavyWallet, market });
  assert.ok(heavy.askPrice! < neutral.askPrice!);
  assert.ok(heavy.bidPrice! < neutral.bidPrice!);
});
