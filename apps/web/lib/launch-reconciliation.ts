import { PublicKey } from '@solana/web3.js';
import type { Project } from './meridian-store';

type Json = Record<string, unknown>;
type LaunchReceiptStatus = NonNullable<Project['launchReceipt']>['status'];
type PairReconciliationValue = { dex: string | null; pairAddress: string | null; url: string | null; liquidityUsd: number | null; volume24h: number | null; priceUsd: string | null };
type MarketReconciliationValue = { marketCap: number | null; migrationComplete: boolean | null; raydiumPool: string | null; virtualSolReserves: unknown };
type SupplyReconciliationValue = { uiAmount: number | null; decimals: number | null; raw: string | null; mintAuthority: unknown; freezeAuthority: unknown };
type HoldersReconciliationValue = { totalHolders: number | null; returnedRows: number; top10Pct: number | null; rows: unknown[] };
type DevPositionReconciliationValue = { deployer: string | null; amount: number | null; pct: number | null; status: string | null };

export type LaunchReconciliationFetch = typeof fetch;

export type ReconciledField<T> = {
  value: T | null;
  status: 'ok' | 'partial' | 'missing' | 'error';
  source: string;
  confidence: 'high' | 'medium' | 'low';
  observedAt: string;
  note?: string | null;
};

export type LaunchReconciliation = {
  contract: 'bondr-launch-reconciliation-v1';
  status: 'ok' | 'partial' | 'blocked';
  observedAt: string;
  projectId: string;
  mint: string | null;
  route: string | null;
  receipt: {
    status: LaunchReceiptStatus | null;
    signature: string | null;
    explorerUrl: string | null;
    confirmedAt: string | null;
    deployer: string | null;
    provider: string | null;
    transactionMessageHash: string | null;
    simulationTransactionMessageHash: string | null;
    simulationStatus: string | null;
    broadcastPolicy: NonNullable<Project['launchReceipt']>['broadcastPolicy'] | null;
  };
  pair: ReconciledField<PairReconciliationValue>;
  market: ReconciledField<MarketReconciliationValue>;
  supply: ReconciledField<SupplyReconciliationValue>;
  holders: ReconciledField<HoldersReconciliationValue>;
  devPosition: ReconciledField<DevPositionReconciliationValue>;
  topTraders: ReconciledField<{ rows: Array<{ wallet: string | null; buys: number; sells: number; volumeUsd: number; lastSeenAt: string | null }>; sourceRows: number }>;
  sources: Record<string, { status: string; route: string; note?: string | null }>;
  blockers: string[];
  warnings: string[];
  execution: 'read-only-launch-reconciliation-no-signing-no-broadcast';
};

function objectValue(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function validPublicKey(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new PublicKey(value).toBase58();
  } catch {
    return null;
  }
}

function field<T>(value: T | null, source: string, observedAt: string, options: Partial<Omit<ReconciledField<T>, 'value' | 'source' | 'observedAt'>> = {}): ReconciledField<T> {
  return {
    value,
    status: options.status ?? (value === null ? 'missing' : 'ok'),
    source,
    confidence: options.confidence ?? (value === null ? 'low' : 'medium'),
    observedAt,
    note: options.note ?? null
  };
}

async function readJson(fetchImpl: LaunchReconciliationFetch, origin: string, route: string) {
  try {
    const response = await fetchImpl(`${origin}${route}`, { headers: { accept: 'application/json' }, cache: 'no-store' });
    const body = await response.json().catch(() => null) as Json | null;
    return {
      ok: response.ok,
      status: body && typeof body.status === 'string' ? body.status : response.ok ? 'ok' : 'error',
      route,
      body: body ?? {},
      note: response.ok ? null : `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      status: 'error',
      route,
      body: {},
      note: error instanceof Error ? error.message : 'provider fetch failed'
    };
  }
}

function topTradersFromTrades(transactions: Json, observedAt: string) {
  const trades = arrayValue(transactions.trades).map(objectValue);
  const rows = new Map<string, { wallet: string | null; buys: number; sells: number; volumeUsd: number; lastSeenAt: string | null }>();
  for (const trade of trades) {
    const wallet = stringValue(trade.wallet) ?? stringValue(trade.owner) ?? stringValue(trade.feePayer);
    if (!wallet) continue;
    const side = String(trade.side ?? '').toLowerCase();
    const current = rows.get(wallet) ?? { wallet, buys: 0, sells: 0, volumeUsd: 0, lastSeenAt: null };
    if (side.includes('buy')) current.buys += 1;
    if (side.includes('sell')) current.sells += 1;
    current.volumeUsd += numberValue(trade.volumeUsd) ?? numberValue(trade.valueUsd) ?? 0;
    const timestamp = stringValue(trade.timestamp) ?? stringValue(trade.observedAt);
    if (timestamp && (!current.lastSeenAt || timestamp > current.lastSeenAt)) current.lastSeenAt = timestamp;
    rows.set(wallet, current);
  }
  const sorted = [...rows.values()].sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, 10);
  return field({ rows: sorted, sourceRows: trades.length }, 'token-transactions', observedAt, {
    status: sorted.length ? 'ok' : trades.length ? 'partial' : 'missing',
    confidence: sorted.length ? 'medium' : 'low',
    note: sorted.length ? null : 'Top traders require wallet-attributed trade tape rows.'
  });
}

export async function buildLaunchReconciliation(project: Project, origin: string, fetchImpl: LaunchReconciliationFetch = fetch): Promise<LaunchReconciliation> {
  const observedAt = new Date().toISOString();
  const receipt = project.launchReceipt;
  const mint = validPublicKey(receipt?.tokenMint ?? project.tokenMint);
  const blockers = [
    receipt ? null : 'launch-receipt-missing',
    mint ? null : 'valid-launch-mint-missing'
  ].filter((item): item is string => Boolean(item));

  if (blockers.length) {
    return {
      contract: 'bondr-launch-reconciliation-v1',
      status: 'blocked',
      observedAt,
      projectId: project.id,
      mint,
      route: receipt?.route ?? project.launchPath ?? null,
      receipt: {
        status: receipt?.status ?? null,
        signature: receipt?.signature ?? null,
        explorerUrl: receipt?.explorerUrl ?? null,
        confirmedAt: receipt?.confirmedAt ?? null,
        deployer: receipt?.deployer ?? null,
        provider: receipt?.provider ?? null,
        transactionMessageHash: receipt?.transactionMessageHash ?? null,
        simulationTransactionMessageHash: receipt?.simulationTransactionMessageHash ?? null,
        simulationStatus: receipt?.simulationStatus ?? null,
        broadcastPolicy: receipt?.broadcastPolicy ?? null
      },
      pair: field<PairReconciliationValue>(null, 'dexscreener', observedAt),
      market: field<MarketReconciliationValue>(null, 'pumpfun', observedAt),
      supply: field<SupplyReconciliationValue>(null, 'token-stats', observedAt),
      holders: field<HoldersReconciliationValue>(null, 'token-stats', observedAt),
      devPosition: field<DevPositionReconciliationValue>(null, 'token-stats', observedAt),
      topTraders: field({ rows: [], sourceRows: 0 }, 'token-transactions', observedAt, { status: 'missing', confidence: 'low' }),
      sources: {},
      blockers,
      warnings: [],
      execution: 'read-only-launch-reconciliation-no-signing-no-broadcast'
    };
  }

  const queryMint = encodeURIComponent(mint ?? '');
  const [marketFeed, tokenStats, pumpfun, transactions] = await Promise.all([
    readJson(fetchImpl, origin, `/api/token-market-feed?mint=${queryMint}`),
    readJson(fetchImpl, origin, `/api/token-stats?mint=${queryMint}&fastHolders=1&holderListLimit=20`),
    readJson(fetchImpl, origin, `/api/pumpfun/token?mint=${queryMint}`),
    readJson(fetchImpl, origin, `/api/token-transactions?mint=${queryMint}&limit=75`)
  ]);

  const bestPair = objectValue(marketFeed.body.bestPair);
  const migration = objectValue(pumpfun.body.migration);
  const supply = objectValue(tokenStats.body.supply);
  const rugcheck = objectValue(tokenStats.body.rugcheck);
  const holders = objectValue(tokenStats.body.holders);
  const concentration = objectValue(tokenStats.body.concentration);
  const devHolding = objectValue(tokenStats.body.devHolding);

  const pair = field(
    bestPair.pairAddress || bestPair.url
      ? {
          dex: stringValue(bestPair.dex),
          pairAddress: stringValue(bestPair.pairAddress),
          url: stringValue(bestPair.url),
          liquidityUsd: numberValue(bestPair.liquidityUsd),
          volume24h: numberValue(bestPair.volume24h),
          priceUsd: stringValue(bestPair.priceUsd)
        }
      : null,
    'dexscreener/token-market-feed',
    observedAt,
    { status: bestPair.pairAddress || bestPair.url ? 'ok' : 'missing', confidence: bestPair.pairAddress ? 'high' : 'low', note: marketFeed.note }
  );

  const market = field({
    marketCap: numberValue(migration.marketCap),
    migrationComplete: typeof migration.complete === 'boolean' ? migration.complete : null,
    raydiumPool: stringValue(migration.raydiumPool),
    virtualSolReserves: migration.virtualSolReserves ?? null
  }, 'pumpfun/token', observedAt, { status: pumpfun.ok ? 'ok' : 'partial', confidence: pumpfun.ok ? 'medium' : 'low', note: pumpfun.note });

  const supplyField = field({
    uiAmount: numberValue(supply.uiAmount),
    decimals: numberValue(supply.decimals),
    raw: stringValue(supply.raw),
    mintAuthority: rugcheck.mintAuthority ?? null,
    freezeAuthority: rugcheck.freezeAuthority ?? null
  }, 'token-stats/solana-rpc', observedAt, { status: tokenStats.ok ? 'ok' : 'partial', confidence: tokenStats.ok ? 'medium' : 'low', note: tokenStats.note });

  const holderRows = arrayValue(holders.rows);
  const holderField = field({
    totalHolders: numberValue(holders.totalHolders),
    returnedRows: numberValue(holders.returnedRows) ?? holderRows.length,
    top10Pct: numberValue(concentration.top10Pct),
    rows: holderRows.slice(0, 20)
  }, 'token-stats/holders', observedAt, {
    status: holderRows.length ? 'ok' : numberValue(holders.totalHolders) !== null ? 'partial' : 'missing',
    confidence: holderRows.length ? 'medium' : 'low',
    note: stringValue(holders.note) ?? tokenStats.note
  });

  const devField = field({
    deployer: receipt?.deployer ?? null,
    amount: numberValue(devHolding.amount),
    pct: numberValue(devHolding.pct),
    status: stringValue(devHolding.status)
  }, 'token-stats/devHolding', observedAt, { status: devHolding.status ? 'ok' : 'partial', confidence: devHolding.amount !== undefined ? 'medium' : 'low', note: stringValue(devHolding.note) });

  const topTraders = topTradersFromTrades(transactions.body, observedAt);
  const sources = {
    marketFeed: { status: marketFeed.status, route: marketFeed.route, note: marketFeed.note },
    tokenStats: { status: tokenStats.status, route: tokenStats.route, note: tokenStats.note },
    pumpfun: { status: pumpfun.status, route: pumpfun.route, note: pumpfun.note },
    tokenTransactions: { status: transactions.status, route: transactions.route, note: transactions.note }
  };
  const warnings = [
    pair.status === 'missing' ? 'pair-unresolved' : null,
    holderField.status === 'missing' ? 'holders-unresolved' : null,
    topTraders.status === 'missing' ? 'top-traders-unresolved' : null,
    ...Object.entries(sources).filter(([, source]) => source.status === 'error').map(([key]) => `${key}-provider-error`)
  ].filter((item): item is string => Boolean(item));

  return {
    contract: 'bondr-launch-reconciliation-v1',
    status: warnings.length ? 'partial' : 'ok',
    observedAt,
    projectId: project.id,
    mint,
    route: receipt?.route ?? project.launchPath ?? null,
    receipt: {
      status: receipt?.status ?? null,
      signature: receipt?.signature ?? null,
      explorerUrl: receipt?.explorerUrl ?? null,
      confirmedAt: receipt?.confirmedAt ?? null,
      deployer: receipt?.deployer ?? null,
      provider: receipt?.provider ?? null,
      transactionMessageHash: receipt?.transactionMessageHash ?? null,
      simulationTransactionMessageHash: receipt?.simulationTransactionMessageHash ?? null,
      simulationStatus: receipt?.simulationStatus ?? null,
      broadcastPolicy: receipt?.broadcastPolicy ?? null
    },
    pair,
    market,
    supply: supplyField,
    holders: holderField,
    devPosition: devField,
    topTraders,
    sources,
    blockers,
    warnings,
    execution: 'read-only-launch-reconciliation-no-signing-no-broadcast'
  };
}
