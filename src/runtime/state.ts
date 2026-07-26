import fs from 'node:fs';
import path from 'node:path';
import type { BotMode } from '../types/config.js';
import type { MarketSnapshot, WalletSnapshot } from '../types/decision.js';
import { runRuntimeStep, type RuntimeStepInput, type RuntimeStepResult } from './loop.js';

export type RuntimeStateWalletSummary = {
  name: string | null;
  pubkey: string | null;
};

export type RuntimeStateSummary = {
  schemaVersion: 1;
  latestStep: {
    observedAt: string;
    mode: BotMode | 'unknown';
    halted: boolean;
    wallet: RuntimeStateWalletSummary;
    market: {
      referencePrice: number | null;
    };
    risk: {
      passed: boolean;
      reasons: string[];
    };
    drawdown: {
      action: 'allow' | 'block' | 'halt' | null;
      passed: boolean | null;
      reasons: string[];
      drawdownBps: number | null;
      dailyLossSol: number | null;
    };
    quoteLevels: {
      count: number;
      skipped: boolean;
      reason: string | null;
    };
    decision: {
      side: string;
      sizeSol: number;
      reason: string;
    };
    execution: {
      mode: string;
      executed: boolean;
      signature: string | null;
      reason: string;
    };
    skippedReason: string | null;
  };
};

export type RuntimeStepSummaryContext = {
  mode?: BotMode;
  wallet?: Pick<WalletSnapshot, 'name' | 'pubkey'>;
  market?: Pick<MarketSnapshot, 'referencePrice'>;
};

export type RuntimeStateEvent = {
  observedAt: string;
  type: 'runtime_step' | 'risk_block' | 'drawdown_block' | 'drawdown_halt' | 'halt_detected' | 'transaction_retry' | 'transaction_pass' | 'note';
  summary?: RuntimeStateSummary;
  message?: string;
};

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function atomicWriteJson(filePath: string, value: unknown): void {
  ensureParentDir(filePath);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

export function summarizeRuntimeStep(
  result: RuntimeStepResult,
  context: RuntimeStepSummaryContext = {}
): RuntimeStateSummary {
  return {
    schemaVersion: 1,
    latestStep: {
      observedAt: result.observedAt,
      mode: context.mode ?? result.execution.mode ?? 'unknown',
      halted: result.halted,
      wallet: {
        name: context.wallet?.name ?? result.decision.wallet,
        pubkey: context.wallet?.pubkey ?? null
      },
      market: {
        referencePrice: context.market?.referencePrice ?? result.quotePlan.midPrice
      },
      risk: {
        passed: result.risk.passed,
        reasons: [...result.risk.reasons]
      },
      drawdown: {
        action: result.drawdown?.action ?? null,
        passed: result.drawdown?.passed ?? null,
        reasons: [...(result.drawdown?.reasons ?? [])],
        drawdownBps: result.drawdown?.drawdownBps ?? null,
        dailyLossSol: result.drawdown?.dailyLossSol ?? null
      },
      quoteLevels: {
        count: result.quoteLevels.levels.length,
        skipped: result.quoteLevels.skipped,
        reason: result.quoteLevels.reason
      },
      decision: {
        side: result.decision.side,
        sizeSol: result.decision.sizeSol,
        reason: result.decision.reason
      },
      execution: {
        mode: result.execution.mode,
        executed: result.execution.executed,
        signature: result.execution.signature,
        reason: result.execution.reason
      },
      skippedReason: result.skippedReason
    }
  };
}

export function writeRuntimeState(filePath: string, summary: RuntimeStateSummary): void {
  atomicWriteJson(filePath, summary);
}

export function readRuntimeState(filePath: string): RuntimeStateSummary | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.trim().length === 0) return null;
  return JSON.parse(raw) as RuntimeStateSummary;
}

export function appendRuntimeEvent(filePath: string, event: RuntimeStateEvent): void {
  ensureParentDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export function readRuntimeEvents(filePath: string): RuntimeStateEvent[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (raw.length === 0) return [];
  return raw.split('\n').map((line) => JSON.parse(line) as RuntimeStateEvent);
}

export function runAndPersistRuntimeStep(args: {
  input: RuntimeStepInput;
  statePath: string;
  eventPath?: string;
}): RuntimeStateSummary {
  const result = runRuntimeStep(args.input);
  const summary = summarizeRuntimeStep(result, {
    mode: args.input.config.mode,
    wallet: args.input.wallet,
    market: args.input.market
  });

  writeRuntimeState(args.statePath, summary);

  if (args.eventPath !== undefined) {
    appendRuntimeEvent(args.eventPath, {
      observedAt: summary.latestStep.observedAt,
      type: result.halted
        ? 'halt_detected'
        : result.drawdown?.action === 'halt'
          ? 'drawdown_halt'
          : result.drawdown?.action === 'block'
            ? 'drawdown_block'
            : result.risk.passed
              ? 'runtime_step'
              : 'risk_block',
      summary,
      message: summary.latestStep.skippedReason ?? summary.latestStep.decision.reason
    });
  }

  return summary;
}
