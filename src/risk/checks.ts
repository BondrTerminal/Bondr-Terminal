import type { MarketMakerConfig, WalletConfig } from '../types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../types/decision.js';

export type RiskCheckInput = {
  config: MarketMakerConfig;
  market: MarketSnapshot;
  walletConfig: WalletConfig;
  wallet: WalletSnapshot;
  proposedSizeSol: number;
  nowMs?: number;
};

export function runRiskChecks(input: RiskCheckInput): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const { config, market, walletConfig, wallet, proposedSizeSol } = input;
  const nowMs = input.nowMs ?? Date.now();
  const observedMs = Date.parse(market.observedAt);

  if (config.mode !== 'dry-run') {
    reasons.push(`mode ${config.mode} requires manual review before live execution is implemented`);
  }

  if (!Number.isFinite(observedMs)) {
    reasons.push('market observedAt timestamp is invalid');
  } else if (nowMs - observedMs > config.globalRisk.maxMarketDataAgeMs) {
    reasons.push(`market data stale: age ${nowMs - observedMs}ms exceeds max ${config.globalRisk.maxMarketDataAgeMs}ms`);
  }

  if (proposedSizeSol <= 0) {
    reasons.push('proposed size must be positive');
  }

  if (proposedSizeSol > config.globalRisk.maxTradeSol) {
    reasons.push(`proposed size ${proposedSizeSol} exceeds maxTradeSol ${config.globalRisk.maxTradeSol}`);
  }

  if (wallet.solBalance - proposedSizeSol < walletConfig.minSolReserve) {
    reasons.push(`wallet ${wallet.name} would fall below min SOL reserve ${walletConfig.minSolReserve}`);
  }

  if (wallet.tokenBalance > walletConfig.maxTokenInventory) {
    reasons.push(`wallet ${wallet.name} token inventory exceeds configured max`);
  }

  if (market.estimatedSlippageBps !== null && market.estimatedSlippageBps > config.globalRisk.maxSlippageBps) {
    reasons.push(`slippage ${market.estimatedSlippageBps}bps exceeds max ${config.globalRisk.maxSlippageBps}bps`);
  }

  if (market.referencePrice === null) {
    reasons.push('reference price unavailable');
  }

  return { passed: reasons.length === 0, reasons };
}
