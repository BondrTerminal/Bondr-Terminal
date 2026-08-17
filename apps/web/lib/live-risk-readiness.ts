import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type LiveRiskLimits = {
  maxSolPerSwap: number;
  maxUsdcPerSwap: number;
  maxSlippageBps: number;
  maxDailyLossSol: number;
  killSwitchDrawdownBps: number;
};

export type LiveRiskObservation = {
  startedAt?: string | null;
  startValueSol?: number | null;
  currentValueSol?: number | null;
  realizedPnlSol?: number | null;
  observedAt?: string | null;
};

export type LiveRiskReadiness = {
  contract: 'bondr-live-risk-readiness-v1';
  status: 'ready' | 'blocked';
  limits: LiveRiskLimits;
  drawdown: {
    observed: boolean;
    startedAt: string | null;
    observedAt: string | null;
    lossSol: number | null;
    dailyLossSol: number | null;
    drawdownBps: number | null;
    action: 'allow' | 'block' | 'halt';
    reasons: string[];
  };
  killSwitch: {
    active: boolean;
    checkedPaths: string[];
    blocker: 'kill-switch-active' | null;
  };
  blockers: string[];
  warnings: string[];
  safety: {
    blocksBroadcastWhenActive: true;
    blocksDeploymentWhenActive: true;
    noMutation: true;
  };
  execution: 'live-risk-readiness-only-no-trading-no-mutation';
};

function defaultHaltPaths() {
  return Array.from(new Set([
    resolve(process.cwd(), 'HALT'),
    resolve(process.cwd(), '..', '..', 'HALT')
  ]));
}

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function drawdownBps(startValueSol: number, currentValueSol: number) {
  if (startValueSol <= 0) return 0;
  return Math.max(0, Math.round(((startValueSol - currentValueSol) / startValueSol) * 10_000));
}

export function buildLiveRiskReadiness(input: {
  limits: LiveRiskLimits;
  observation?: LiveRiskObservation | null;
  liveTradingEnabled?: boolean;
  haltPaths?: string[];
  haltActive?: boolean;
}): LiveRiskReadiness {
  const checkedPaths = input.haltPaths ?? defaultHaltPaths();
  const killSwitchActive = typeof input.haltActive === 'boolean' ? input.haltActive : checkedPaths.some((path) => existsSync(path));
  const observation = input.observation ?? null;
  const observed = Boolean(
    observation &&
    positiveNumber(observation.startValueSol) &&
    typeof observation.currentValueSol === 'number' &&
    Number.isFinite(observation.currentValueSol) &&
    observation.currentValueSol >= 0
  );
  const startValueSol = observed ? Number(observation?.startValueSol) : null;
  const currentValueSol = observed ? Number(observation?.currentValueSol) : null;
  const realizedPnlSol = typeof observation?.realizedPnlSol === 'number' && Number.isFinite(observation.realizedPnlSol) ? observation.realizedPnlSol : 0;
  const lossSol = observed && startValueSol !== null && currentValueSol !== null ? Math.max(startValueSol - currentValueSol, 0) : null;
  const dailyLossSol = observed && lossSol !== null ? Math.max(-realizedPnlSol, lossSol, 0) : null;
  const drawdown = observed && startValueSol !== null && currentValueSol !== null ? drawdownBps(startValueSol, currentValueSol) : null;
  const reasons = [
    !observed ? 'live-risk-drawdown-observation-required' : null,
    dailyLossSol !== null && dailyLossSol >= input.limits.maxDailyLossSol ? `daily loss ${dailyLossSol} SOL meets/exceeds maxDailyLossSol ${input.limits.maxDailyLossSol}` : null,
    drawdown !== null && drawdown >= input.limits.killSwitchDrawdownBps ? `drawdown ${drawdown}bps meets/exceeds killSwitchDrawdownBps ${input.limits.killSwitchDrawdownBps}` : null
  ].filter((item): item is string => Boolean(item));
  const action: LiveRiskReadiness['drawdown']['action'] = drawdown !== null && drawdown >= input.limits.killSwitchDrawdownBps
    ? 'halt'
    : reasons.length
      ? 'block'
      : 'allow';
  const blockers = [
    killSwitchActive ? 'kill-switch-active' : null,
    input.liveTradingEnabled && !observed ? 'live-risk-drawdown-observation-required' : null,
    dailyLossSol !== null && dailyLossSol >= input.limits.maxDailyLossSol ? 'max-daily-loss-exceeded' : null,
    drawdown !== null && drawdown >= input.limits.killSwitchDrawdownBps ? 'drawdown-kill-switch-triggered' : null
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'bondr-live-risk-readiness-v1',
    status: blockers.length ? 'blocked' : 'ready',
    limits: input.limits,
    drawdown: {
      observed,
      startedAt: observed ? observation?.startedAt ?? null : null,
      observedAt: observed ? observation?.observedAt ?? null : null,
      lossSol,
      dailyLossSol,
      drawdownBps: drawdown,
      action,
      reasons
    },
    killSwitch: {
      active: killSwitchActive,
      checkedPaths,
      blocker: killSwitchActive ? 'kill-switch-active' : null
    },
    blockers: Array.from(new Set(blockers)),
    warnings: observed ? [] : ['No live drawdown/daily-loss observation supplied; preview mode can continue, but live broadcast/deployment must stay closed.'],
    safety: {
      blocksBroadcastWhenActive: true,
      blocksDeploymentWhenActive: true,
      noMutation: true
    },
    execution: 'live-risk-readiness-only-no-trading-no-mutation'
  };
}
