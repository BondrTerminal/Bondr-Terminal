import { evaluateDrawdown, type DrawdownEvaluation } from '../risk/drawdown.js';
import type { MarketMakerConfig } from '../types/config.js';
import type { PaperPnlSummary } from './paper-pnl.js';

export type PaperRiskSummary = {
  observedAt: string;
  wallet: {
    name: string;
    pubkey: string;
  };
  passed: boolean;
  action: 'allow' | 'block' | 'halt';
  lossSol: number | null;
  drawdownBps: number | null;
  dailyLossSol: number | null;
  reasons: string[];
  source: 'paper-pnl';
  liveExecution: false;
  paperOnly: true;
};

function unmarkedPaperRisk(args: {
  paperPnl: PaperPnlSummary;
  reasons: string[];
}): PaperRiskSummary {
  return {
    observedAt: args.paperPnl.observedAt,
    wallet: { ...args.paperPnl.wallet },
    passed: false,
    action: 'block',
    lossSol: null,
    drawdownBps: args.paperPnl.drawdownBps,
    dailyLossSol: null,
    reasons: args.reasons,
    source: 'paper-pnl',
    liveExecution: false,
    paperOnly: true
  };
}

function fromDrawdownEvaluation(args: {
  paperPnl: PaperPnlSummary;
  evaluation: DrawdownEvaluation;
}): PaperRiskSummary {
  return {
    observedAt: args.paperPnl.observedAt,
    wallet: { ...args.paperPnl.wallet },
    passed: args.evaluation.passed,
    action: args.evaluation.action,
    lossSol: args.evaluation.lossSol,
    drawdownBps: args.evaluation.drawdownBps,
    dailyLossSol: args.evaluation.dailyLossSol,
    reasons: [...args.evaluation.reasons],
    source: 'paper-pnl',
    liveExecution: false,
    paperOnly: true
  };
}

export function evaluatePaperRisk(args: {
  config: Pick<MarketMakerConfig, 'globalRisk'>;
  paperPnl: PaperPnlSummary;
}): PaperRiskSummary {
  const { paperPnl } = args;
  const reasons: string[] = [];

  if (paperPnl.currentPaperPortfolioValueSol === null) {
    reasons.push('paper risk blocked: paper portfolio value is unmarked');
  }

  if (paperPnl.totalPaperPnlSol === null) {
    reasons.push('paper risk blocked: total paper PnL is unmarked');
  }

  if (paperPnl.drawdownBps === null) {
    reasons.push('paper risk blocked: paper drawdown is unmarked');
  }

  if (paperPnl.skippedReasons.length > 0) {
    reasons.push(...paperPnl.skippedReasons.map((reason) => `paper pnl warning: ${reason}`));
  }

  if (reasons.some((reason) => reason.startsWith('paper risk blocked:'))) {
    return unmarkedPaperRisk({ paperPnl, reasons });
  }

  const currentPaperPortfolioValueSol = paperPnl.currentPaperPortfolioValueSol;
  if (currentPaperPortfolioValueSol === null) {
    return unmarkedPaperRisk({ paperPnl, reasons: [...reasons, 'paper risk blocked: paper portfolio value is unmarked'] });
  }

  const evaluation = evaluateDrawdown({
    checkpoint: {
      startedAt: paperPnl.observedAt,
      startValueSol: paperPnl.startingPortfolioValueSol,
      currentValueSol: currentPaperPortfolioValueSol,
      realizedPnlSol: paperPnl.realizedPnlSol
    },
    maxDailyLossSol: args.config.globalRisk.maxDailyLossSol,
    killSwitchDrawdownBps: args.config.globalRisk.killSwitchDrawdownBps
  });

  if (reasons.length > 0) {
    evaluation.reasons.push(...reasons);
  }

  return fromDrawdownEvaluation({ paperPnl, evaluation });
}
