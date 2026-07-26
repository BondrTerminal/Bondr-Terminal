import pino from 'pino';
import { createLocalPaperSessionFixtureReport } from '../src/runtime/paper-session-fixture.js';

function valueAfterFlag(name: string): string | undefined {
  const prefix = `${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return raw?.slice(prefix.length);
}

function numberAfterFlag(name: string): number | undefined {
  const raw = valueAfterFlag(name);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number; received ${raw}`);
  return parsed;
}

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const reportPath = valueAfterFlag('--report');
const makerFeeBps = numberAfterFlag('--maker-fee-bps');
const takerFeeBps = numberAfterFlag('--taker-fee-bps');

const { paths, result, report } = await createLocalPaperSessionFixtureReport({
  reportPath,
  makerFeeBps,
  takerFeeBps
});

logger.info({
  reportPath: paths.reportPath,
  statePath: paths.statePath,
  openOrdersPath: paths.openOrdersPath,
  eventPath: paths.eventPath,
  executedCycleCount: report.executedCycleCount,
  stoppedReason: report.stoppedReason,
  finalOpenOrderCount: report.totals.finalOpenOrderCount,
  filledOrderCount: report.totals.filledOrderCount,
  partiallyFilledOrderCount: report.totals.partiallyFilledOrderCount,
  finalPaperPnlSol: report.final.paperPnl?.totalPaperPnlSol ?? null,
  finalPaperRisk: report.final.paperRisk?.action ?? null,
  feeAdjustedSpreadCapturedSol: report.final.spreadCapture?.feeAdjustedSpreadCapturedSol ?? null,
  paperOnly: report.paperOnly,
  liveExecution: report.liveExecution,
  resultPaperOnly: result.summary.paperOnly
}, 'generated local paper-session report fixture');
