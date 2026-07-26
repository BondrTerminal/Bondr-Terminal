import type { MarketMakerConfig, WalletConfig } from '../types/config.js';
import type { Decision, MarketSnapshot, WalletSnapshot } from '../types/decision.js';
import { decideForWallet } from '../decision/decide.js';
import { buildQuotePlan, type QuotePlan } from '../decision/quote-plan.js';
import { runRiskChecks } from '../risk/checks.js';
import { isHalted } from '../risk/halt.js';
import {
  buildDrawdownCheckpoint,
  evaluateConfigDrawdown,
  type DrawdownCheckpoint,
  type DrawdownEvaluation
} from '../risk/drawdown.js';
import { buildQuoteLevels, type QuoteLevelOptions, type QuoteLevelsPlan } from '../quote/levels.js';
import { dryRunExecute, type ExecutionResult } from '../execution/dry-run.js';

export type RuntimeRiskResult = {
  passed: boolean;
  reasons: string[];
};

export type RuntimeStepInput = {
  config: MarketMakerConfig;
  walletConfig: WalletConfig;
  wallet: WalletSnapshot;
  wallets?: WalletSnapshot[];
  market: MarketSnapshot;
  startedAt: string;
  startValueSol: number;
  realizedPnlSol?: number;
  nowMs?: number;
  haltFile?: string;
  quoteLevelOptions?: QuoteLevelOptions;
};

export type RuntimeStepResult = {
  observedAt: string;
  halted: boolean;
  decision: Decision;
  execution: ExecutionResult;
  risk: RuntimeRiskResult;
  drawdown: DrawdownEvaluation | null;
  drawdownCheckpoint: DrawdownCheckpoint | null;
  quotePlan: QuotePlan;
  quoteLevels: QuoteLevelsPlan;
  skippedReason: string | null;
};

function waitDecision(args: {
  wallet: string;
  reason: string;
  riskPassed: boolean;
  riskReasons?: string[];
}): Decision {
  return {
    observedAt: new Date().toISOString(),
    side: 'wait',
    sizeSol: 0,
    reason: args.reason,
    riskPassed: args.riskPassed,
    riskReasons: args.riskReasons ?? [],
    wallet: args.wallet
  };
}

export function runRuntimeStep(input: RuntimeStepInput): RuntimeStepResult {
  const { config, walletConfig, wallet, market } = input;
  const observedAt = market.observedAt;
  const halted = isHalted(input.haltFile);

  const quotePlan = buildQuotePlan({ config, walletConfig, wallet, market });
  const quoteLevels = buildQuoteLevels({
    config,
    walletConfig,
    wallet,
    quotePlan,
    options: input.quoteLevelOptions
  });

  const proposedSizeSol = Math.min(config.globalRisk.maxTradeSol, walletConfig.maxSolToUse);
  const risk = runRiskChecks({
    config,
    market,
    walletConfig,
    wallet,
    proposedSizeSol,
    nowMs: input.nowMs
  });

  const drawdownCheckpoint = buildDrawdownCheckpoint({
    startedAt: input.startedAt,
    startValueSol: input.startValueSol,
    wallets: input.wallets ?? [wallet],
    tokenPriceSol: market.referencePrice,
    realizedPnlSol: input.realizedPnlSol
  });
  const drawdown = drawdownCheckpoint === null
    ? null
    : evaluateConfigDrawdown({ config, checkpoint: drawdownCheckpoint });

  let decision = decideForWallet({ config, walletConfig, wallet, market, nowMs: input.nowMs });
  let skippedReason: string | null = null;

  if (halted) {
    skippedReason = `halt file present at ${input.haltFile ?? 'HALT'}`;
    decision = waitDecision({
      wallet: wallet.name,
      reason: `runtime skipped: ${skippedReason}`,
      riskPassed: false,
      riskReasons: [skippedReason]
    });
  } else if (!risk.passed) {
    skippedReason = `risk blocked: ${risk.reasons.join('; ')}`;
    decision = waitDecision({
      wallet: wallet.name,
      reason: skippedReason,
      riskPassed: false,
      riskReasons: risk.reasons
    });
  } else if (drawdown?.action === 'halt') {
    skippedReason = `drawdown halt: ${drawdown.reasons.join('; ')}`;
    decision = waitDecision({
      wallet: wallet.name,
      reason: skippedReason,
      riskPassed: false,
      riskReasons: drawdown.reasons
    });
  } else if (drawdown?.action === 'block') {
    skippedReason = `drawdown blocked: ${drawdown.reasons.join('; ')}`;
    decision = waitDecision({
      wallet: wallet.name,
      reason: skippedReason,
      riskPassed: false,
      riskReasons: drawdown.reasons
    });
  } else if (quoteLevels.skipped) {
    skippedReason = quoteLevels.reason;
  }

  return {
    observedAt,
    halted,
    decision,
    execution: dryRunExecute(decision),
    risk,
    drawdown,
    drawdownCheckpoint,
    quotePlan,
    quoteLevels,
    skippedReason
  };
}
