import type { MarketMakerConfig } from '../types/config.js';
import type { WalletSnapshot } from '../types/decision.js';

export function getMockWalletSnapshots(config: MarketMakerConfig): WalletSnapshot[] {
  return config.wallets.map((wallet) => ({
    name: wallet.name,
    pubkey: wallet.pubkey,
    solBalance: wallet.minSolReserve + wallet.maxSolToUse,
    tokenBalance: wallet.targetTokenInventory
  }));
}
