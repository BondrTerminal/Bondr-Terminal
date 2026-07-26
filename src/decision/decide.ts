import type { MarketMakerConfig, WalletConfig } from '../types/config.js';
import type { Decision, MarketSnapshot, WalletSnapshot } from '../types/decision.js';
import { runRiskChecks } from '../risk/checks.js';

export function decideForWallet(args: {
  config: MarketMakerConfig;
  walletConfig: WalletConfig;
  wallet: WalletSnapshot;
  market: MarketSnapshot;
  nowMs?: number;
}): Decision {
  const { config, walletConfig, wallet, market } = args;

  const inventoryDelta = walletConfig.targetTokenInventory - wallet.tokenBalance;
  const proposedSizeSol = Math.min(config.globalRisk.maxTradeSol, walletConfig.maxSolToUse);

  let side: Decision['side'] = 'wait';
  let reason = 'inventory is at target; no action';

  if (market.referencePrice === null) {
    side = 'wait';
    reason = 'waiting because reference price is unavailable';
  } else if (inventoryDelta > 0) {
    side = 'buy';
    reason = 'token inventory below target';
  } else if (inventoryDelta < 0) {
    side = 'sell';
    reason = 'token inventory above target';
  }

  const risk = side === 'wait'
    ? { passed: true, reasons: [] }
    : runRiskChecks({ config, market, walletConfig, wallet, proposedSizeSol, nowMs: args.nowMs });

  if (!risk.passed) {
    return {
      observedAt: new Date().toISOString(),
      side: 'wait',
      sizeSol: 0,
      reason: `risk-off: ${risk.reasons.join('; ')}`,
      riskPassed: false,
      riskReasons: risk.reasons,
      wallet: wallet.name
    };
  }

  return {
    observedAt: new Date().toISOString(),
    side,
    sizeSol: side === 'wait' ? 0 : proposedSizeSol,
    reason,
    riskPassed: true,
    riskReasons: [],
    wallet: wallet.name
  };
}
