import type { WalletConfig } from '../types/config.js';

export function controlledWalletSet(wallets: WalletConfig[]): Set<string> {
  return new Set(wallets.map((wallet) => wallet.pubkey));
}

export function assertNotSelfTrade(args: {
  controlledWallets: Set<string>;
  makerOwner?: string | null;
  takerOwner?: string | null;
}): void {
  if (!args.makerOwner || !args.takerOwner) return;
  if (args.controlledWallets.has(args.makerOwner) && args.controlledWallets.has(args.takerOwner)) {
    throw new Error('self-trade guard: maker and taker are both controlled wallets');
  }
}
