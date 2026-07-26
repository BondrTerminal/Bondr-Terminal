import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import fallbackStatusJson from '../data/fallback-status.json';

export const MarketMakerStatusSchema = z.object({
  mode: z.enum(['offline', 'dry-run', 'paper', 'live-disabled']),
  health: z.enum(['ok', 'warning', 'halted']),
  cluster: z.string(),
  venue: z.string(),
  lastObservationAt: z.string().nullable(),
  liveTradingEnabled: z.literal(false),
  wallet: z.object({
    name: z.string(),
    pubkey: z.string(),
    solBalance: z.number().nullable(),
    tokenBalance: z.number().nullable()
  }),
  token: z.object({
    mint: z.string(),
    symbol: z.string(),
    decimals: z.number().int().nonnegative(),
    supplyUi: z.number().nullable()
  }),
  quote: z.object({
    mint: z.string(),
    symbol: z.string(),
    decimals: z.number().int().nonnegative()
  }),
  market: z.object({
    referencePrice: z.number().nullable(),
    estimatedSlippageBps: z.number().nullable(),
    volatilityBps: z.number().nullable()
  }),
  risk: z.object({
    maxTotalSolExposure: z.number(),
    maxTradeSol: z.number(),
    maxTradesPerMinute: z.number(),
    maxSlippageBps: z.number(),
    maxDailyLossSol: z.number(),
    killSwitchDrawdownBps: z.number(),
    maxMarketDataAgeMs: z.number()
  }),
  strategy: z.object({
    autonomy: z.enum(['manual', 'supervised', 'autonomous-paper', 'autonomous-live-disabled']),
    objective: z.string(),
    engineState: z.enum(['offline', 'observing', 'quoting', 'waiting-for-fills', 'risk-blocked', 'halted', 'stale']),
    baseSpreadBps: z.number(),
    minSpreadBps: z.number(),
    maxSpreadBps: z.number(),
    inventorySkewBps: z.number(),
    targetInventoryUi: z.number().nullable(),
    maxInventoryUi: z.number().nullable(),
    minDelayMs: z.number(),
    maxDelayMs: z.number()
  }).optional(),
  notes: z.array(z.string()),
  source: z.enum(['remote-url', 'status-file', 'fallback'])
});

export type MarketMakerStatus = z.infer<typeof MarketMakerStatusSchema>;

const NullableNumber = z.number().nullable();

export const PaperPnlSummarySchema = z.object({
  observedAt: z.string(),
  wallet: z.object({
    name: z.string(),
    pubkey: z.string()
  }),
  startingPortfolioValueSol: z.number(),
  currentPaperPortfolioValueSol: NullableNumber,
  realizedPnlSol: z.number(),
  realizedPnlFromMatchedPaperBuysSol: z.number(),
  realizedPnlFromStartingInventorySol: z.number(),
  startingTokenInventoryUi: z.number(),
  startingTokenCostBasisSol: NullableNumber,
  startingTokenAverageCostSol: NullableNumber,
  unrealizedPnlSol: NullableNumber,
  totalPaperPnlSol: NullableNumber,
  drawdownBps: NullableNumber,
  filledBuyVolumeSol: z.number(),
  filledSellVolumeSol: z.number(),
  filledBuySizeUi: z.number(),
  filledSellSizeUi: z.number(),
  filledBuyGrossVolumeSol: z.number(),
  filledSellGrossVolumeSol: z.number(),
  filledBuyNetCostSol: z.number(),
  filledSellNetProceedsSol: z.number(),
  paperFeesSol: z.number(),
  paperSlippageSol: z.number(),
  openBidNotionalSol: z.number(),
  openAskNotionalSol: z.number(),
  activeOpenOrderCount: z.number().int().nonnegative(),
  filledOrderCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  skippedReasons: z.array(z.string()),
  liveExecution: z.literal(false),
  paperOnly: z.literal(true)
});

export const PaperRiskSummarySchema = z.object({
  observedAt: z.string(),
  wallet: z.object({
    name: z.string(),
    pubkey: z.string()
  }),
  passed: z.boolean(),
  action: z.enum(['allow', 'block', 'halt']),
  lossSol: NullableNumber,
  drawdownBps: NullableNumber,
  dailyLossSol: NullableNumber,
  reasons: z.array(z.string()),
  source: z.literal('paper-pnl'),
  liveExecution: z.literal(false),
  paperOnly: z.literal(true)
});

export const PaperSpreadCaptureSummarySchema = z.object({
  matchedSizeUi: z.number(),
  unmatchedInventoryUi: z.number(),
  averageBuyQuotedPrice: NullableNumber,
  averageSellQuotedPrice: NullableNumber,
  averageBuyExecutedPrice: NullableNumber,
  averageSellExecutedPrice: NullableNumber,
  quotedSpreadSol: NullableNumber,
  quotedSpreadBps: NullableNumber,
  executedSpreadSol: NullableNumber,
  executedSpreadBps: NullableNumber,
  grossSpreadCapturedSol: z.number(),
  feeAdjustedSpreadCapturedSol: z.number(),
  totalFeesSol: z.number(),
  slippageAttributionSol: z.number(),
  buyFillCount: z.number().int().nonnegative(),
  sellFillCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  skippedReasons: z.array(z.string()),
  liveExecution: z.literal(false),
  paperOnly: z.literal(true)
});

export const PaperSessionReportCycleSchema = z.object({
  cycleIndex: z.number().int().nonnegative(),
  observedAt: z.string(),
  halted: z.boolean(),
  referencePrice: NullableNumber,
  runtimeRiskPassed: z.boolean(),
  runtimeRiskReasons: z.array(z.string()),
  drawdownAction: z.enum(['allow', 'block', 'halt']).nullable(),
  drawdownReasons: z.array(z.string()),
  placedOrderCount: z.number().int().nonnegative(),
  filledOrderCount: z.number().int().nonnegative(),
  partiallyFilledOrderCount: z.number().int().nonnegative(),
  cancelledOrderCount: z.number().int().nonnegative(),
  expiredOrderCount: z.number().int().nonnegative(),
  openOrderCount: z.number().int().nonnegative(),
  skippedReasons: z.array(z.string()),
  paperPnl: PaperPnlSummarySchema,
  paperRisk: PaperRiskSummarySchema,
  spreadCapture: PaperSpreadCaptureSummarySchema,
  liveExecution: z.literal(false),
  paperOnly: z.literal(true)
});

export const PaperSessionReportSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().nullable(),
  requestedCycleCount: z.number().int().nonnegative(),
  maxCycles: z.number().int().nonnegative(),
  executedCycleCount: z.number().int().nonnegative(),
  stoppedReason: z.string().nullable(),
  totals: z.object({
    placedOrderCount: z.number().int().nonnegative(),
    filledOrderCount: z.number().int().nonnegative(),
    partiallyFilledOrderCount: z.number().int().nonnegative(),
    cancelledOrderCount: z.number().int().nonnegative(),
    expiredOrderCount: z.number().int().nonnegative(),
    finalOpenOrderCount: z.number().int().nonnegative()
  }),
  final: z.object({
    paperPnl: PaperPnlSummarySchema.nullable(),
    paperRisk: PaperRiskSummarySchema.nullable(),
    spreadCapture: PaperSpreadCaptureSummarySchema.nullable()
  }),
  cycles: z.array(PaperSessionReportCycleSchema),
  skippedReasons: z.array(z.string()),
  liveExecution: z.literal(false),
  paperOnly: z.literal(true)
});

export const PaperSessionReportResponseSchema = z.object({
  source: z.enum(['remote-url', 'report-file', 'fallback']),
  report: PaperSessionReportSchema.nullable()
});

export const RuntimeFeedEventSchema = z.object({
  observedAt: z.string(),
  type: z.enum(['runtime_step', 'risk_block', 'drawdown_block', 'drawdown_halt', 'halt_detected', 'transaction_retry', 'transaction_pass', 'note']),
  message: z.string().optional(),
  summary: z.unknown().optional()
});

export const RuntimeFeedResponseSchema = z.object({
  source: z.enum(['event-file', 'fallback']),
  events: z.array(RuntimeFeedEventSchema),
  eventCount: z.number().int().nonnegative()
});

export const OperatorFeedResponseSchema = z.object({
  generatedAt: z.string(),
  status: MarketMakerStatusSchema,
  reportResponse: PaperSessionReportResponseSchema,
  runtimeEvents: RuntimeFeedResponseSchema,
  liveTradingEnabled: z.literal(false)
});

export type PaperSessionReport = z.infer<typeof PaperSessionReportSchema>;
export type PaperSessionReportResponse = z.infer<typeof PaperSessionReportResponseSchema>;
export type RuntimeFeedEvent = z.infer<typeof RuntimeFeedEventSchema>;
export type RuntimeFeedResponse = z.infer<typeof RuntimeFeedResponseSchema>;
export type OperatorFeedResponse = z.infer<typeof OperatorFeedResponseSchema>;

export const defaultStatus: MarketMakerStatus = MarketMakerStatusSchema.parse(fallbackStatusJson);
const REMOTE_FETCH_TIMEOUT_MS = 5_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REMOTE_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseStatusWithSource(value: unknown, source: MarketMakerStatus['source']): MarketMakerStatus {
  return MarketMakerStatusSchema.parse({ ...(value as Record<string, unknown>), source });
}

async function getStatusFromUrl(): Promise<MarketMakerStatus | null> {
  const url = process.env.MARKET_MAKER_STATUS_URL;
  if (!url) return null;

  try {
    const res = await fetchWithTimeout(url, {
      cache: 'no-store',
      headers: process.env.MARKET_MAKER_CONTROL_API_KEY
        ? { authorization: `Bearer ${process.env.MARKET_MAKER_CONTROL_API_KEY}` }
        : undefined
    });
    if (!res.ok) return null;
    return parseStatusWithSource(await res.json(), 'remote-url');
  } catch {
    return null;
  }
}

function artifactPathCandidates(configuredPath: string): string[] {
  const normalized = path.normalize(configuredPath).replace(/^([/\\])+/, '');
  if (path.isAbsolute(configuredPath) || normalized.startsWith('..')) return [];
  return [path.join(/*turbopackIgnore: true*/ process.cwd(), normalized)];
}

async function readJsonFromCandidates(paths: string[]): Promise<unknown | null> {
  for (const filePath of paths) {
    try {
      const raw = await readFile(filePath, 'utf8');
      return JSON.parse(raw) as unknown;
    } catch {
      // Try the next safe local artifact path.
    }
  }
  return null;
}

async function getStatusFromFile(): Promise<MarketMakerStatus | null> {
  const configuredPath = process.env.MARKET_MAKER_STATUS_FILE ?? 'runtime/market-maker-status.local.json';

  try {
    const parsed = await readJsonFromCandidates(artifactPathCandidates(configuredPath));
    if (parsed === null) return null;
    return parseStatusWithSource(parsed, 'status-file');
  } catch {
    return null;
  }
}

export async function getMarketMakerStatus(): Promise<MarketMakerStatus> {
  return (await getStatusFromUrl()) ?? (await getStatusFromFile()) ?? defaultStatus;
}

function parseReportResponse(value: unknown, source: PaperSessionReportResponse['source']): PaperSessionReportResponse {
  return PaperSessionReportResponseSchema.parse({ source, report: value });
}

async function getReportFromUrl(): Promise<PaperSessionReportResponse | null> {
  const url = process.env.MARKET_MAKER_REPORT_URL;
  if (!url) return null;

  try {
    const res = await fetchWithTimeout(url, {
      cache: 'no-store',
      headers: process.env.MARKET_MAKER_CONTROL_API_KEY
        ? { authorization: `Bearer ${process.env.MARKET_MAKER_CONTROL_API_KEY}` }
        : undefined
    });
    if (!res.ok) return null;
    return parseReportResponse(await res.json(), 'remote-url');
  } catch {
    return null;
  }
}

async function getReportFromFile(): Promise<PaperSessionReportResponse | null> {
  const configuredPath = process.env.MARKET_MAKER_REPORT_FILE ?? 'runtime/paper-session-report.json';

  try {
    const parsed = await readJsonFromCandidates(artifactPathCandidates(configuredPath));
    if (parsed === null) return null;
    return parseReportResponse(parsed, 'report-file');
  } catch {
    return null;
  }
}

function parseRuntimeEvents(raw: string): RuntimeFeedEvent[] {
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => RuntimeFeedEventSchema.parse(JSON.parse(line)));
}

async function getRuntimeEventsFromFile(): Promise<RuntimeFeedResponse | null> {
  const configuredPath = process.env.MARKET_MAKER_EVENTS_FILE;
  const configuredPaths = configuredPath === undefined
    ? ['runtime/paper-observed-events.ndjson', 'runtime/paper-session-fixture-events.ndjson']
    : [configuredPath];

  const events: RuntimeFeedEvent[] = [];
  for (const runtimePath of configuredPaths) {
    for (const filePath of artifactPathCandidates(runtimePath)) {
      try {
        const raw = await readFile(filePath, 'utf8');
        events.push(...parseRuntimeEvents(raw));
        break;
      } catch {
        // Try the next safe local artifact path.
      }
    }
  }

  if (events.length === 0) return null;
  const latestEvents = events
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
    .slice(-50)
    .reverse();
  return { source: 'event-file', events: latestEvents, eventCount: latestEvents.length };
}

export async function getPaperSessionReport(): Promise<PaperSessionReportResponse> {
  return (await getReportFromUrl()) ?? (await getReportFromFile()) ?? { source: 'fallback', report: null };
}

export async function getRuntimeEvents(): Promise<RuntimeFeedResponse> {
  return (await getRuntimeEventsFromFile()) ?? { source: 'fallback', events: [], eventCount: 0 };
}

export async function getOperatorFeed(): Promise<OperatorFeedResponse> {
  const [status, reportResponse, runtimeEvents] = await Promise.all([
    getMarketMakerStatus(),
    getPaperSessionReport(),
    getRuntimeEvents()
  ]);

  return OperatorFeedResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    status,
    reportResponse,
    runtimeEvents,
    liveTradingEnabled: false
  });
}

export function formatNumber(value: number | null, options?: Intl.NumberFormatOptions): string {
  if (value === null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', options).format(value);
}

export function shortKey(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
