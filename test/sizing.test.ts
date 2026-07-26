import assert from 'node:assert/strict';
import test from 'node:test';
import { clampTradeSizeSol, inventorySkew } from '../src/decision/sizing.js';
import type { MarketMakerConfig } from '../src/types/config.js';
import type { WalletSnapshot } from '../src/types/decision.js';

const walletConfig = {
  name: 'w1',
  pubkey: 'Wallet11111111111111111111111111111111111111',
  maxSolToUse: 0.2,
  minSolReserve: 0.1,
  maxTokenInventory: 1000,
  targetTokenInventory: 500
};

const config = {
  globalRisk: { maxTradeSol: 0.05 }
} as MarketMakerConfig;

const wallet: WalletSnapshot = {
  name: 'w1',
  pubkey: walletConfig.pubkey,
  solBalance: 0.13,
  tokenBalance: 750
};

test('clamps trade size by spendable SOL reserve', () => {
  const size = clampTradeSizeSol({ config, walletConfig, wallet, desiredSizeSol: 1 });
  assert.equal(size, 0.03);
});

test('computes inventory skew relative to target', () => {
  assert.equal(inventorySkew({ walletConfig, wallet }), 0.5);
});
