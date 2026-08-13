export const dynamic = 'force-dynamic';

type Json = Record<string, unknown>;

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function numberOrNull(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function ageMs(timestamp: unknown) {
  const ms = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
  return Number.isFinite(ms) ? Date.now() - ms : null;
}

function compactAge(timestamp: unknown) {
  const ms = ageMs(timestamp);
  if (ms === null) return '—';
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function sideOf(value: unknown): 'buy' | 'sell' | 'unknown' {
  const side = String(value ?? '').toLowerCase();
  if (side.includes('buy')) return 'buy';
  if (side.includes('sell')) return 'sell';
  return 'unknown';
}

function summarize(rows: Json[]) {
  const buyRows = rows.filter((row) => row.side === 'buy');
  const sellRows = rows.filter((row) => row.side === 'sell');
  const buyVolumeUsd = buyRows.reduce((sum, row) => sum + (numberOrNull(row.volumeUsd) ?? 0), 0);
  const sellVolumeUsd = sellRows.reduce((sum, row) => sum + (numberOrNull(row.volumeUsd) ?? 0), 0);
  const largestBuyUsd = Math.max(0, ...buyRows.map((row) => numberOrNull(row.volumeUsd) ?? 0));
  const largestSellUsd = Math.max(0, ...sellRows.map((row) => numberOrNull(row.volumeUsd) ?? 0));
  return {
    rows: rows.length,
    buys: buyRows.length,
    sells: sellRows.length,
    buyVolumeUsd,
    sellVolumeUsd,
    netFlowUsd: buyVolumeUsd - sellVolumeUsd,
    largestBuyUsd,
    largestSellUsd,
    lastTradeAge: rows[0]?.timestamp ? compactAge(rows[0].timestamp) : null
  };
}

export async function GET(request: Request) {
  const started = Date.now();
  const { origin, searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim() ?? '';
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '120') || 120, 1), 300);
  if (!MINT_RE.test(mint)) return Response.json({ status: 'error', error: 'Missing or invalid mint.', execution: 'read-only-trade-feed-no-trading' }, { status: 400 });

  try {
    const fast = searchParams.get('fast') === '1';
    const response = await fetch(`${origin}/api/token-transactions?mint=${encodeURIComponent(mint)}&limit=${limit}${fast ? '&fast=1' : ''}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({ status: 'error', trades: [], tradeTape: { note: 'Invalid token-transactions JSON.' } })) as Json;
    const rawTrades = Array.isArray(payload.trades) ? payload.trades as Json[] : [];
    const rows = rawTrades.slice(0, limit).map((trade) => {
      const side = sideOf(trade.side);
      return {
        timestamp: typeof trade.timestamp === 'string' ? trade.timestamp : null,
        age: compactAge(trade.timestamp),
        side,
        wallet: typeof trade.wallet === 'string' ? trade.wallet : null,
        amount: numberOrNull(trade.amount),
        priceUsd: numberOrNull(trade.priceUsd),
        volumeUsd: numberOrNull(trade.volumeUsd),
        txHash: typeof trade.txHash === 'string' ? trade.txHash : null,
        source: typeof trade.source === 'string' ? trade.source : null,
        provider: typeof trade.provider === 'string' ? trade.provider : typeof trade.source === 'string' ? trade.source : null,
        confidence: typeof trade.confidence === 'string' ? trade.confidence : 'low',
        attributionStatus: typeof trade.attributionStatus === 'string' ? trade.attributionStatus : 'unattributed'
      };
    });
    const tradeTape = payload.tradeTape && typeof payload.tradeTape === 'object' ? payload.tradeTape as Json : {};
    return Response.json({
      status: rows.length ? 'ok' : 'empty',
      source: 'terminal-trade-feed',
      observedAt: new Date().toISOString(),
      mint,
      rows,
      summary: summarize(rows),
      provider: {
        primary: tradeTape.primary ?? null,
        status: tradeTape.status ?? payload.status ?? null,
        latencyMs: tradeTape.latencyMs ?? null,
        note: tradeTape.note ?? null,
        rows: rows.length
      },
      upstream: {
        httpOk: response.ok,
        status: payload.status ?? null,
        source: 'token-transactions'
      },
      latencyMs: Date.now() - started,
      execution: 'read-only-trade-feed-no-trading'
    }, { status: response.ok ? 200 : response.status });
  } catch (error) {
    return Response.json({ status: 'error', source: 'terminal-trade-feed', observedAt: new Date().toISOString(), mint, rows: [], summary: summarize([]), provider: { primary: null, status: 'unavailable', latencyMs: null, note: error instanceof Error ? error.message : 'Trade feed failed.', rows: 0 }, latencyMs: Date.now() - started, execution: 'read-only-trade-feed-no-trading' }, { status: 200 });
  }
}
