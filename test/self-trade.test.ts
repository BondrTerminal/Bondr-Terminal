import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNotSelfTrade, controlledWalletSet } from '../src/risk/self-trade.js';

const wallets = controlledWalletSet([
  {
    name: 'a',
    pubkey: 'WalletAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    maxSolToUse: 1,
    minSolReserve: 0.1,
    maxTokenInventory: 1000,
    targetTokenInventory: 500
  },
  {
    name: 'b',
    pubkey: 'WalletBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    maxSolToUse: 1,
    minSolReserve: 0.1,
    maxTokenInventory: 1000,
    targetTokenInventory: 500
  }
]);

test('allows trade with external wallet', () => {
  assert.doesNotThrow(() => assertNotSelfTrade({
    controlledWallets: wallets,
    makerOwner: 'WalletAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    takerOwner: 'External111111111111111111111111111111111111'
  }));
});

test('blocks controlled wallet crossing controlled wallet', () => {
  assert.throws(() => assertNotSelfTrade({
    controlledWallets: wallets,
    makerOwner: 'WalletAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    takerOwner: 'WalletBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
  }), /self-trade guard/);
});
