import fs from 'node:fs';
import path from 'node:path';
import type { PaperPnlSummary } from './paper-pnl.js';
import type { PaperRiskSummary } from './paper-risk.js';
import type { PaperRunnerResult } from './paper-runner.js';
import type { PaperSpreadCaptureSummary } from './spread-capture.js';

export type PaperSessionReportCycle = {
  cycleIndex: number;
  observedAt: string;
  halted: boolean;
  referencePrice: number | null;
  runtimeRiskPassed: boolean;
  runtimeRiskReasons: string[];
  drawdownAction: 'allow' | 'block' | 'halt' | null;
  drawdownReasons: string[];
  placedOrderCount: number;
  filledOrderCount: number;
  partiallyFilledOrderCount: number;
  cancelledOrderCount: number;
  expiredOrderCount: number;
  openOrderCount: number;
  skippedReasons: string[];
  paperPnl: PaperPnlSummary;
  paperRisk: PaperRiskSummary;
  spreadCapture: PaperSpreadCaptureSummary;
  liveExecution: false;
  paperOnly: true;
};

export type PaperSessionReport = {
  schemaVersion: 1;
  generatedAt: string | null;
  requestedCycleCount: number;
  maxCycles: number;
  executedCycleCount: number;
  stoppedReason: string | null;
  totals: {
    placedOrderCount: number;
    filledOrderCount: number;
    partiallyFilledOrderCount: number;
    cancelledOrderCount: number;
    expiredOrderCount: number;
    finalOpenOrderCount: number;
  };
  final: {
    paperPnl: PaperPnlSummary | null;
    paperRisk: PaperRiskSummary | null;
    spreadCapture: PaperSpreadCaptureSummary | null;
  };
  cycles: PaperSessionReportCycle[];
  skippedReasons: string[];
  liveExecution: false;
  paperOnly: true;
};

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons.filter((reason) => reason.length > 0))];
}

function cycleSkippedReasons(cycle: PaperRunnerResult['cycles'][number]): string[] {
  return uniqueReasons([
    ...cycle.runtimeState.latestStep.risk.reasons,
    ...cycle.runtimeState.latestStep.drawdown.reasons,
    ...cycle.cancelReplace.skippedReasons,
    ...cycle.paperFills.skippedReasons,
    ...cycle.paperPnl.skippedReasons,
    ...cycle.paperRisk.reasons,
    ...cycle.spreadCapture.skippedReasons
  ]);
}

function summarizeCycle(cycle: PaperRunnerResult['cycles'][number]): PaperSessionReportCycle {
  const latestStep = cycle.runtimeState.latestStep;
  return {
    cycleIndex: cycle.cycleIndex,
    observedAt: latestStep.observedAt,
    halted: latestStep.halted,
    referencePrice: latestStep.market.referencePrice,
    runtimeRiskPassed: latestStep.risk.passed,
    runtimeRiskReasons: [...latestStep.risk.reasons],
    drawdownAction: latestStep.drawdown.action,
    drawdownReasons: [...latestStep.drawdown.reasons],
    placedOrderCount: cycle.cancelReplace.placedReplacementOrderCount,
    filledOrderCount: cycle.paperFills.filledOrderCount,
    partiallyFilledOrderCount: cycle.paperFills.partiallyFilledOrderCount,
    cancelledOrderCount: cycle.cancelReplace.cancelledOrderCount,
    expiredOrderCount: cycle.cancelReplace.expiredOrderCount,
    openOrderCount: cycle.orders.length,
    skippedReasons: cycleSkippedReasons(cycle),
    paperPnl: cycle.paperPnl,
    paperRisk: cycle.paperRisk,
    spreadCapture: cycle.spreadCapture,
    liveExecution: false,
    paperOnly: true
  };
}

export function createPaperSessionReport(result: PaperRunnerResult): PaperSessionReport {
  const cycles = result.cycles.map(summarizeCycle);
  const skippedReasons = uniqueReasons(cycles.flatMap((cycle) => cycle.skippedReasons));
  const generatedAt = cycles.at(-1)?.observedAt ?? null;

  return {
    schemaVersion: 1,
    generatedAt,
    requestedCycleCount: result.summary.requestedCycleCount,
    maxCycles: result.summary.maxCycles,
    executedCycleCount: result.summary.executedCycleCount,
    stoppedReason: result.summary.stoppedReason,
    totals: {
      placedOrderCount: result.summary.totalPlacedOrderCount,
      filledOrderCount: result.summary.totalFilledOrderCount,
      partiallyFilledOrderCount: result.summary.totalPartiallyFilledOrderCount,
      cancelledOrderCount: result.summary.totalCancelledOrderCount,
      expiredOrderCount: result.summary.totalExpiredOrderCount,
      finalOpenOrderCount: result.summary.finalOpenOrderCount
    },
    final: {
      paperPnl: result.summary.finalPaperPnl,
      paperRisk: result.summary.finalPaperRisk,
      spreadCapture: result.summary.finalSpreadCapture
    },
    cycles,
    skippedReasons,
    liveExecution: false,
    paperOnly: true
  };
}

export function writePaperSessionReport(filePath: string, report: PaperSessionReport): void {
  ensureParentDir(filePath);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

export function readPaperSessionReport(filePath: string): PaperSessionReport | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.trim().length === 0) return null;
  const parsed = JSON.parse(raw) as PaperSessionReport;
  if (parsed.schemaVersion !== 1) {
    throw new Error(`unsupported paper session report schema version: ${String(parsed.schemaVersion)}`);
  }
  return parsed;
}
