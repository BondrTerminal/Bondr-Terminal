import { type FlowEvent, type MeridianStore } from './meridian-store';
import { getMeridianWalletStore } from './durable-wallet-store';
import { buildPortfolioFills } from './portfolio-fills';
import { computeRealizedPnl, type WalletTradeFill } from './realized-pnl';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const RANGE_DAYS: Record<string, number | null> = { '1d': 1, '7d': 7, '30d': 30, max: null };

type ChartPoint = { time: string; value: number };
type HistogramPoint = ChartPoint & { color: string };


export type PortfolioTimeseries = {
  contract: 'portfolio-timeseries-v1';
  status: 'ok' | 'partial' | 'unavailable';
  observedAt: string;
  range: '1d' | '7d' | '30d' | 'max';
  currency: 'USD';
  source: 'meridian-flow-events+jupiter-price-v3' | 'helius-wallet-history+jupiter-price-v3';
  confidence: 'modeled' | 'high' | 'unavailable';
  costBasisMethod: 'weighted-average';
  solUsd: number | null;
  series: {
    cumulativeRealizedPnl: ChartPoint[];
    dailyRealizedPnl: HistogramPoint[];
    cumulativeNetFlow: ChartPoint[];
  };
  summary: {
    realizedPnlUsd: number | null;
    netFlowUsd: number | null;
    eventCount: number;
    buyCount: number;
    sellCount: number;
  };
  gaps: string[];
};

function dayKey(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function inRange(event: FlowEvent, range: PortfolioTimeseries['range'], now = Date.now()) {
  const days = RANGE_DAYS[range];
  if (days === null) return true;
  const ts = new Date(event.timestamp).getTime();
  if (!Number.isFinite(ts)) return false;
  return ts >= now - days * 24 * 60 * 60 * 1000;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

async function fetchSolUsd(): Promise<number | null> {
  try {
    const response = await fetch(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await response.json() as Record<string, { usdPrice?: number; price?: number }>;
    const price = payload[SOL_MINT]?.usdPrice ?? payload[SOL_MINT]?.price;
    return typeof price === 'number' && Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

async function fetchHistoricalSolUsd(events: FlowEvent[], fallback: number | null): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!events.length) return map;
  const timestamps = events.map((event) => new Date(event.timestamp).getTime()).filter(Number.isFinite);
  if (!timestamps.length) return map;
  const from = Math.floor((Math.min(...timestamps) - 24 * 60 * 60 * 1000) / 1000);
  const to = Math.floor((Math.max(...timestamps) + 24 * 60 * 60 * 1000) / 1000);
  try {
    const url = `https://api.coingecko.com/api/v3/coins/solana/market_chart/range?vs_currency=usd&from=${from}&to=${to}`;
    const response = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`CoinGecko ${response.status}`);
    const payload = await response.json() as { prices?: Array<[number, number]> };
    for (const [ms, price] of payload.prices ?? []) {
      if (Number.isFinite(ms) && Number.isFinite(price)) map.set(new Date(ms).toISOString().slice(0, 10), price);
    }
  } catch {
    // Best-effort historical pricing. The caller will fall back to current SOL/USD and label confidence accordingly.
  }
  if (fallback !== null) {
    for (const event of events) if (!map.has(dayKey(event.timestamp))) map.set(dayKey(event.timestamp), fallback);
  }
  return map;
}

function flowEventToFill(event: FlowEvent, solUsdByDay: Map<string, number>): WalletTradeFill | null {
  if (event.type !== 'buy' && event.type !== 'sell') return null;
  return {
    id: event.id,
    wallet: null,
    projectId: event.projectId,
    mint: null,
    timestamp: event.timestamp,
    side: event.type,
    tokenAmount: event.tokenAmount,
    quoteAmountSol: event.solAmount,
    priceUsd: solUsdByDay.get(dayKey(event.timestamp)) ?? null,
    source: 'meridian-flow-events',
    confidence: 'modeled'
  };
}

export async function buildPortfolioTimeseries(inputRange?: string, storeOverride?: MeridianStore): Promise<PortfolioTimeseries> {
  const observedAt = new Date().toISOString();
  const range = inputRange === '1d' || inputRange === '7d' || inputRange === '30d' || inputRange === 'max' ? inputRange : '30d';
  const store = storeOverride ?? await getMeridianWalletStore();
  const solUsd = await fetchSolUsd();
  const events = store.flowEvents
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .filter((event) => inRange(event, range));
  const provider = await buildPortfolioFills({ limit: 100 }, store).catch(() => null);
  const providerFills = provider?.fills ?? [];
  const solUsdByDay = await fetchHistoricalSolUsd(events, solUsd);
  const modeledFills = events.map((event) => flowEventToFill(event, solUsdByDay)).filter((fill): fill is WalletTradeFill => Boolean(fill));
  const fills = providerFills.length ? providerFills : modeledFills;
  const pnl = computeRealizedPnl(fills, 'weighted-average');
  const realizedByDay = new Map<string, number>();
  for (const match of pnl.matches) realizedByDay.set(dayKey(match.timestamp), (realizedByDay.get(dayKey(match.timestamp)) ?? 0) + (match.realizedPnlUsd ?? 0));

  const daily = new Map<string, { realizedUsd: number; netUsd: number; buys: number; sells: number; events: number }>();
  for (const fill of fills) {
    const key = dayKey(fill.timestamp);
    const row = daily.get(key) ?? { realizedUsd: 0, netUsd: 0, buys: 0, sells: 0, events: 0 };
    const priceUsd = fill.priceUsd ?? solUsdByDay.get(key) ?? solUsd;
    const netSol = fill.side === 'sell' ? Math.max(0, fill.quoteAmountSol) : -Math.max(0, fill.quoteAmountSol);
    row.netUsd += priceUsd !== null ? netSol * priceUsd : 0;
    row.buys += fill.side === 'buy' ? 1 : 0;
    row.sells += fill.side === 'sell' ? 1 : 0;
    row.events += 1;
    daily.set(key, row);
  }
  for (const [key, value] of realizedByDay) {
    const row = daily.get(key) ?? { realizedUsd: 0, netUsd: 0, buys: 0, sells: 0, events: 0 };
    row.realizedUsd = value;
    daily.set(key, row);
  }

  let cumulativeRealizedUsd = 0;
  let cumulativeNetUsd = 0;
  const cumulativeRealizedPnl: ChartPoint[] = [];
  const cumulativeNetFlow: ChartPoint[] = [];
  const dailyRealizedPnl: HistogramPoint[] = [];

  for (const [time, row] of Array.from(daily.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    cumulativeRealizedUsd += row.realizedUsd;
    cumulativeNetUsd += row.netUsd;
    const realizedValue = roundMoney(row.realizedUsd);
    dailyRealizedPnl.push({ time, value: realizedValue, color: realizedValue >= 0 ? 'rgba(54, 214, 160, 0.52)' : 'rgba(227, 93, 106, 0.52)' });
    cumulativeRealizedPnl.push({ time, value: roundMoney(cumulativeRealizedUsd) });
    cumulativeNetFlow.push({ time, value: roundMoney(cumulativeNetUsd) });
  }

  const buyCount = fills.filter((fill) => fill.side === 'buy').length;
  const sellCount = fills.filter((fill) => fill.side === 'sell').length;
  const gaps = [
    provider && !providerFills.length ? 'Provider-backed fills unavailable; falling back to modeled Meridian local flow events.' : null,
    ...(provider?.gaps ?? []),
    solUsdByDay.size === 0 && !providerFills.length ? 'Historical SOL/USD pricing unavailable; chart values may be incomplete.' : null,
    ...pnl.gaps
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'portfolio-timeseries-v1',
    status: fills.length ? (pnl.confidence === 'high' ? 'ok' : 'partial') : 'unavailable',
    observedAt,
    range,
    currency: 'USD',
    source: providerFills.length ? 'helius-wallet-history+jupiter-price-v3' : 'meridian-flow-events+jupiter-price-v3',
    confidence: fills.length ? pnl.confidence : 'unavailable',
    costBasisMethod: 'weighted-average',
    solUsd,
    series: { cumulativeRealizedPnl, dailyRealizedPnl, cumulativeNetFlow },
    summary: {
      realizedPnlUsd: pnl.realizedPnlUsd,
      netFlowUsd: daily.size ? roundMoney(cumulativeNetUsd) : null,
      eventCount: fills.length,
      buyCount,
      sellCount
    },
    gaps
  };
}
