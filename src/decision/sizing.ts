import { Decimal } from 'decimal.js';
import type { MarketMakerConfig, WalletConfig } from '../types/config.js';
import type { WalletSnapshot } from '../types/decision.js';

export function clampTradeSizeSol(args: {
  config: MarketMakerConfig;
  walletConfig: WalletConfig;
  wallet: WalletSnapshot;
  desiredSizeSol: number;
}): number {
  const desired = new Decimal(args.desiredSizeSol);
  const maxTrade = new Decimal(args.config.globalRisk.maxTradeSol);
  const maxWallet = new Decimal(args.walletConfig.maxSolToUse);
  const spendable = new Decimal(args.wallet.solBalance).minus(args.walletConfig.minSolReserve);
  const clamped = Decimal.min(desired, maxTrade, maxWallet, spendable);
  return Decimal.max(clamped, 0).toNumber();
}

export function inventorySkew(args: {
  walletConfig: WalletConfig;
  wallet: WalletSnapshot;
}): number {
  if (args.walletConfig.targetTokenInventory === 0) return 0;
  return new Decimal(args.wallet.tokenBalance)
    .minus(args.walletConfig.targetTokenInventory)
    .div(args.walletConfig.targetTokenInventory)
    .toNumber();
}
