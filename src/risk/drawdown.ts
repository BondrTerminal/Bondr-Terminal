import { Decimal } from 'decimal.js';
import type { MarketMakerConfig } from '../types/config.js';
import type { WalletSnapshot } from '../types/decision.js';
import { drawdownBps, markPortfolio } from './pnl.js';

export type DrawdownAction = 'allow' | 'block' | 'halt';

export type DrawdownCheckpoint = {
  startedAt: string;
  startValueSol: number;
  currentValueSol: number;
  realizedPnlSol?: number;
};

export type DrawdownEvaluation = {
  passed: boolean;
  action: DrawdownAction;
  lossSol: number;
  drawdownBps: number;
  dailyLossSol: number;
  reasons: string[];
};

export function totalPortfolioValueSol(args: {
  wallets: WalletSnapshot[];
  tokenPriceSol: number | null;
}): number | null {
  if (args.tokenPriceSol === null) return null;

  return args.wallets.reduce((sum, wallet) => {
    const value = markPortfolio({
      solBalance: wallet.solBalance,
      tokenBalance: wallet.tokenBalance,
      tokenPriceSol: args.tokenPriceSol
    });
    return sum.plus(value.totalValueSol ?? 0);
  }, new Decimal(0)).toNumber();
}

export function evaluateDrawdown(args: {
  checkpoint: DrawdownCheckpoint;
  maxDailyLossSol: number;
  killSwitchDrawdownBps: number;
}): DrawdownEvaluation {
  const reasons: string[] = [];
  const startValue = new Decimal(args.checkpoint.startValueSol);
  const currentValue = new Decimal(args.checkpoint.currentValueSol);
  const realizedPnl = new Decimal(args.checkpoint.realizedPnlSol ?? 0);

  if (args.checkpoint.startValueSol <= 0) {
    reasons.push('start portfolio value must be positive for drawdown enforcement');
  }

  if (args.checkpoint.currentValueSol < 0) {
    reasons.push('current portfolio value cannot be negative');
  }

  const lossSol = Decimal.max(startValue.minus(currentValue), 0);
  const dailyLossSol = Decimal.max(realizedPnl.negated(), lossSol, 0);
  const currentDrawdownBps = drawdownBps({
    startValueSol: args.checkpoint.startValueSol,
    currentValueSol: args.checkpoint.currentValueSol
  });

  if (dailyLossSol.greaterThanOrEqualTo(args.maxDailyLossSol)) {
    reasons.push(`daily loss ${dailyLossSol.toNumber()} SOL meets/exceeds maxDailyLossSol ${args.maxDailyLossSol}`);
  }

  if (currentDrawdownBps >= args.killSwitchDrawdownBps) {
    reasons.push(`drawdown ${currentDrawdownBps}bps meets/exceeds killSwitchDrawdownBps ${args.killSwitchDrawdownBps}`);
  }

  const action: DrawdownAction = currentDrawdownBps >= args.killSwitchDrawdownBps
    ? 'halt'
    : reasons.length > 0
      ? 'block'
      : 'allow';

  return {
    passed: action === 'allow',
    action,
    lossSol: lossSol.toNumber(),
    drawdownBps: currentDrawdownBps,
    dailyLossSol: dailyLossSol.toNumber(),
    reasons
  };
}

export function evaluateConfigDrawdown(args: {
  config: MarketMakerConfig;
  checkpoint: DrawdownCheckpoint;
}): DrawdownEvaluation {
  return evaluateDrawdown({
    checkpoint: args.checkpoint,
    maxDailyLossSol: args.config.globalRisk.maxDailyLossSol,
    killSwitchDrawdownBps: args.config.globalRisk.killSwitchDrawdownBps
  });
}

export function buildDrawdownCheckpoint(args: {
  startedAt: string;
  startValueSol: number;
  wallets: WalletSnapshot[];
  tokenPriceSol: number | null;
  realizedPnlSol?: number;
}): DrawdownCheckpoint | null {
  const currentValueSol = totalPortfolioValueSol({ wallets: args.wallets, tokenPriceSol: args.tokenPriceSol });
  if (currentValueSol === null) return null;

  return {
    startedAt: args.startedAt,
    startValueSol: args.startValueSol,
    currentValueSol,
    realizedPnlSol: args.realizedPnlSol
  };
}
