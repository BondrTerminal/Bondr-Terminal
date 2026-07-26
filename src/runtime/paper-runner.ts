import type { PaperOrder } from '../execution/order-lifecycle.js';
import { appendRuntimeEvent } from './state.js';
import {
  runPaperRuntimeCycle,
  type PaperCancelReplaceSummary
} from './cancel-replace.js';
import type { PaperFillSimulationSummary } from './paper-fills.js';
import type { PaperPnlSummary } from './paper-pnl.js';
import type { PaperRiskSummary } from './paper-risk.js';
import { type PaperFeePresetName, type PaperFeeSelection } from './paper-fee-presets.js';
import { createPaperSessionReport, writePaperSessionReport } from './paper-session-report.js';
import { summarizePaperSpreadCapture, type PaperSpreadCaptureSummary } from './spread-capture.js';
import type { RuntimeStateSummary } from './state.js';
import type { RuntimeStepInput } from './loop.js';
import type { PaperQuoteAdapterMap } from './paper-quotes.js';

export type PaperRunnerCycleResult = {
  cycleIndex: number;
  runtimeState: RuntimeStateSummary;
  cancelReplace: PaperCancelReplaceSummary;
  paperFills: PaperFillSimulationSummary;
  paperPnl: PaperPnlSummary;
  paperRisk: PaperRiskSummary;
  paperFeePreset: PaperFeeSelection;
  spreadCapture: PaperSpreadCaptureSummary;
  orders: PaperOrder[];
};

export type PaperRunnerSummary = {
  requestedCycleCount: number;
  maxCycles: number;
  executedCycleCount: number;
  stoppedReason: string | null;
  finalOpenOrderCount: number;
  totalPlacedOrderCount: number;
  totalFilledOrderCount: number;
  totalPartiallyFilledOrderCount: number;
  totalCancelledOrderCount: number;
  totalExpiredOrderCount: number;
  finalPaperPnl: PaperPnlSummary | null;
  finalPaperRisk: PaperRiskSummary | null;
  finalSpreadCapture: PaperSpreadCaptureSummary | null;
  liveExecution: false;
  paperOnly: true;
};

export type PaperRunnerResult = {
  summary: PaperRunnerSummary;
  cycles: PaperRunnerCycleResult[];
};

export async function runBoundedPaperRunner(args: {
  inputs: RuntimeStepInput[];
  statePath: string;
  openOrdersPath: string;
  eventPath?: string;
  reportPath?: string;
  adapters?: PaperQuoteAdapterMap;
  maxCycles: number;
  maxAgeMs?: number;
  maxCrossBps?: number;
  fillRatio?: number;
  makerFeeBps?: number;
  takerFeeBps?: number;
  paperFeePresetName?: PaperFeePresetName;
  stopOnHalt?: boolean;
  stopOnRiskBlock?: boolean;
  stopOnDrawdownBlock?: boolean;
  stopOnPaperRiskBlock?: boolean;
}): Promise<PaperRunnerResult> {
  if (!Number.isInteger(args.maxCycles) || args.maxCycles <= 0) {
    throw new Error(`paper runner maxCycles must be a positive integer; received ${args.maxCycles}`);
  }

  const cyclesToRun = Math.min(args.inputs.length, args.maxCycles);
  const cycles: PaperRunnerCycleResult[] = [];
  let stoppedReason: string | null = null;

  for (let index = 0; index < cyclesToRun; index += 1) {
    const cycle = await runPaperRuntimeCycle({
      input: args.inputs[index],
      statePath: args.statePath,
      openOrdersPath: args.openOrdersPath,
      eventPath: args.eventPath,
      adapters: args.adapters,
      maxAgeMs: args.maxAgeMs,
      maxCrossBps: args.maxCrossBps,
      fillRatio: args.fillRatio,
      makerFeeBps: args.makerFeeBps,
      takerFeeBps: args.takerFeeBps,
      paperFeePresetName: args.paperFeePresetName
    });

    const cycleResult: PaperRunnerCycleResult = {
      cycleIndex: index,
      ...cycle,
      spreadCapture: summarizePaperSpreadCapture({ orders: cycle.orders })
    };
    cycles.push(cycleResult);

    const latestStep = cycle.runtimeState.latestStep;
    if ((args.stopOnHalt ?? true) && latestStep.halted) {
      stoppedReason = `stopped after cycle ${index}: halt detected`;
      break;
    }

    if ((args.stopOnRiskBlock ?? true) && !latestStep.risk.passed) {
      stoppedReason = `stopped after cycle ${index}: risk blocked`;
      break;
    }

    if ((args.stopOnDrawdownBlock ?? true)
      && (latestStep.drawdown.action === 'block' || latestStep.drawdown.action === 'halt')) {
      stoppedReason = `stopped after cycle ${index}: drawdown ${latestStep.drawdown.action}`;
      break;
    }

    if ((args.stopOnPaperRiskBlock ?? true)
      && (cycle.paperRisk.action === 'block' || cycle.paperRisk.action === 'halt')) {
      stoppedReason = `stopped after cycle ${index}: paper risk ${cycle.paperRisk.action}`;
      break;
    }
  }

  if (stoppedReason === null && args.inputs.length > args.maxCycles) {
    stoppedReason = `stopped at maxCycles=${args.maxCycles}`;
  }

  const finalCycle = cycles.at(-1) ?? null;
  const summary: PaperRunnerSummary = {
    requestedCycleCount: args.inputs.length,
    maxCycles: args.maxCycles,
    executedCycleCount: cycles.length,
    stoppedReason,
    finalOpenOrderCount: finalCycle?.orders.length ?? 0,
    totalPlacedOrderCount: cycles.reduce((sum, cycle) => sum + cycle.cancelReplace.placedReplacementOrderCount, 0),
    totalFilledOrderCount: cycles.reduce((sum, cycle) => sum + cycle.paperFills.filledOrderCount, 0),
    totalPartiallyFilledOrderCount: cycles.reduce((sum, cycle) => sum + cycle.paperFills.partiallyFilledOrderCount, 0),
    totalCancelledOrderCount: cycles.reduce((sum, cycle) => sum + cycle.cancelReplace.cancelledOrderCount, 0),
    totalExpiredOrderCount: cycles.reduce((sum, cycle) => sum + cycle.cancelReplace.expiredOrderCount, 0),
    finalPaperPnl: finalCycle?.paperPnl ?? null,
    finalPaperRisk: finalCycle?.paperRisk ?? null,
    finalSpreadCapture: finalCycle?.spreadCapture ?? null,
    liveExecution: false,
    paperOnly: true
  };

  const result: PaperRunnerResult = { summary, cycles };

  if (args.reportPath !== undefined) {
    writePaperSessionReport(args.reportPath, createPaperSessionReport(result));
  }

  if (args.eventPath !== undefined) {
    appendRuntimeEvent(args.eventPath, {
      observedAt: finalCycle?.runtimeState.latestStep.observedAt ?? args.inputs[0]?.market.observedAt ?? new Date(0).toISOString(),
      type: 'note',
      message: `paper runner: executed=${summary.executedCycleCount}/${summary.requestedCycleCount} stopped=${summary.stoppedReason ?? 'completed'} finalPnl=${summary.finalPaperPnl?.totalPaperPnlSol ?? 'unmarked'} finalPaperRisk=${summary.finalPaperRisk?.action ?? 'none'} feeAdjustedSpread=${summary.finalSpreadCapture?.feeAdjustedSpreadCapturedSol ?? 'none'}`
    });
  }

  return result;
}
