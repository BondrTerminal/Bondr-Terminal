export const dynamic = 'force-dynamic';

type Json = Record<string, unknown>;

function objectValue(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function statusFrom(value: unknown, fallback: string) {
  const object = objectValue(value);
  const status = object.status;
  if (typeof status === 'string') return status;
  if (Object.keys(object).length) return fallback;
  return 'unavailable';
}

function sourceFrom(value: unknown, fallback: string) {
  const object = objectValue(value);
  const source = object.source ?? object.primary;
  if (typeof source === 'string') return source;
  return fallback;
}

function noteFrom(value: unknown) {
  const object = objectValue(value);
  const note = object.note ?? object.warning ?? object.reason ?? object.disabledReason ?? object.error;
  return typeof note === 'string' ? note : null;
}

function section(status: string, source: string, observedAt: string, value: unknown, extra: Json = {}) {
  return {
    status,
    source,
    observedAt,
    note: noteFrom(value),
    ...extra,
    data: value ?? null
  };
}

function providerStatus(raw: Json, observedAt: string) {
  const rawSources = objectValue(raw.sources);
  const health = objectValue(rawSources.health);
  const sources = objectValue(health.sources);
  const envAudit = objectValue(raw.providerEnvAudit);
  const envProviders = objectValue(envAudit.providers);
  const names = ['solanaTracker', 'helius', 'birdeye', 'solscan', 'bitquery', 'geckoterminal', 'rugcheck', 'dexscreener', 'jupiter', 'pumpfun', 'solanaRpc'];
  const mapped: Record<string, Json> = {};
  for (const name of names) {
    const auditValue = envProviders[name];
    const value = name === 'solanaRpc' ? objectValue(raw.terminal).rpc : (auditValue ?? sources[name]);
    const item = objectValue(value);
    const configured = item.configured;
    const runtime = objectValue(item.runtime);
    const runtimeStatus = runtime.runtimeStatus;
    const providerStatus = typeof item.providerStatus === 'string' ? item.providerStatus : null;
    mapped[name] = {
      status: providerStatus ?? (typeof item.status === 'string' ? item.status : runtimeStatus === 'ok' ? 'connected' : configured === false ? 'not-configured' : Object.keys(item).length ? 'partial' : 'unavailable'),
      source: name,
      observedAt,
      configured: typeof configured === 'boolean' ? configured : null,
      latencyMs: typeof item.latencyMs === 'number' ? item.latencyMs : null,
      note: noteFrom(item)
    };
  }
  return section(Object.keys(envProviders).length ? 'ok' : 'partial', Object.keys(envProviders).length ? 'terminal-provider-env-audit' : 'indexer-health', observedAt, mapped, { providers: mapped });
}

function normalize(raw: Json, observedAt: string) {
  const pool = objectValue(raw.pool);
  const poolSummary = objectValue(pool.summary);
  const terminal = objectValue(raw.terminal);
  const backendWallets = objectValue(terminal.wallets);
  const trades = objectValue(raw.trades);
  const tradeTape = objectValue(raw.tradeTape ?? trades.tradeTape);
  const devTokens = objectValue(raw.devTokens);
  const execution = objectValue(terminal.execution);
  const bundle = objectValue(terminal.bundle);
  const capabilities = execution.capabilities ?? null;
  const canonicalChart = objectValue(raw.chart);
  const canonicalMarket = objectValue(raw.market);
  const canonicalSecurity = objectValue(raw.security);
  const canonicalLiquidity = objectValue(raw.liquidity);
  const canonicalDiscovery = objectValue(raw.discovery);
  const canonicalHolderCoverage = objectValue(raw.holderCoverage);
  const canonicalSourceStatus = objectValue(raw.sourceStatus);

  const tokenIdentity = {
    status: raw.mint ? 'ok' : 'missing-token',
    source: 'terminal-snapshot',
    observedAt,
    mint: raw.mint ?? null,
    project: raw.project ?? null,
    priceUsd: poolSummary.priceUsd ?? null,
    marketCap: poolSummary.marketCap ?? null,
    bestDex: poolSummary.bestDex ?? null,
    bestPairAddress: poolSummary.bestPairAddress ?? null,
    bestPairUrl: poolSummary.bestPairUrl ?? null,
    note: raw.mint ? null : 'Load a token mint to hydrate terminal data.'
  };

  const orderState = objectValue(raw.orders ?? execution.terminalOrders);
  const bundleState = {
    status: statusFrom(bundle, 'partial'),
    source: 'bundle-sequencer',
    observedAt,
    selectedWalletCount: bundle.selectedWalletCount ?? 0,
    totalSol: bundle.solAvailable ?? null,
    totalUsdc: bundle.totalUsdc ?? null,
    buildReadiness: execution.bundleSequencer ? statusFrom(execution.bundleSequencer, 'partial') : 'preflight-only',
    routeDependency: '/api/bundle-sequencer -> /api/execution-swap -> /api/send-signed-transaction',
    relaySubmission: false,
    relayStatus: 'unavailable',
    relayProvider: null,
    relayRequirements: ['relay provider credentials', 'bundle simulation', 'operator auth', 'durable intent tracking'],
    supportedRelays: [],
    requiredEnv: ['JITO_BLOCK_ENGINE_URL', 'JITO_AUTH_KEYPAIR_OR_TOKEN'],
    simulationRequired: true,
    bundleId: null,
    note: noteFrom(execution.bundleSequencer) ?? 'Current bundle flow is multi-wallet validation/build, not relay submission.',
    data: { bundle, sequencer: execution.bundleSequencer ?? null }
  };

  return {
    tokenIdentity,
    pool: section(statusFrom(raw.pool, 'ok'), sourceFrom(raw.pool, 'dexscreener'), observedAt, raw.pool, { chart: { status: poolSummary.bestPairAddress ? 'available' : 'unavailable', source: 'geckoterminal', observedAt, pairAddress: poolSummary.bestPairAddress ?? null, route: '/api/token-chart' } }),
    marketFeed: section(statusFrom(raw.marketFeed, raw.pool ? 'ok' : 'partial'), 'dexscreener+jupiter', observedAt, raw.marketFeed ?? { summary: poolSummary, transactions: objectValue(trades.summary) }),
    tradeTape: section(statusFrom(tradeTape, (trades.rows as unknown[] | undefined)?.length ? 'ok' : 'empty'), String(tradeTape.primary ?? sourceFrom(objectValue(raw.sources).tradeTape, sourceFrom(trades, 'token-transactions'))), observedAt, tradeTape, { primary: tradeTape.primary ?? null, rows: tradeTape.rows ?? (trades.rows as unknown[] | undefined)?.length ?? 0, blockers: tradeTape.blockers ?? [], optionalProviderGaps: tradeTape.optionalProviderGaps ?? [], latencyMs: tradeTape.latencyMs ?? null }),
    transactionTape: section(statusFrom(trades, (trades.rows as unknown[] | undefined)?.length ? 'ok' : 'empty'), sourceFrom(objectValue(raw.sources).tradeTape, sourceFrom(trades, 'token-transactions')), observedAt, trades, { rows: trades.rows ?? [], topTraders: trades.topTraders ?? [], summary: trades.summary ?? null, tradeTape }),
    holders: section(statusFrom(raw.holders, 'partial'), sourceFrom(raw.holders, 'token-stats'), observedAt, raw.holders, { rows: objectValue(raw.holders).rows ?? [] }),
    topTraders: section((trades.topTraders as unknown[] | undefined)?.length ? 'ok' : 'partial', 'trade-tape-derived', observedAt, trades.topTraders ?? [], { rows: trades.topTraders ?? [], note: (trades.topTraders as unknown[] | undefined)?.length ? null : 'Top traders require wallet-attributed trade rows.' }),
    positions: section(statusFrom(raw.positions, 'partial'), sourceFrom(raw.positions, 'terminal-snapshot-positions'), observedAt, raw.positions, { rows: objectValue(raw.positions).rows ?? [], summary: objectValue(raw.positions).summary ?? null }),
    wallets: section(statusFrom(backendWallets, 'ok'), 'terminal-backend', observedAt, backendWallets, { rows: backendWallets.rows ?? [], balances: backendWallets.tokenBalances ?? null }),
    orders: section(statusFrom(orderState, 'ok'), 'terminal-order-engine', observedAt, orderState, { rows: orderState.orders ?? [], lifecycle: 'created → evaluated → triggered → transaction_built → signed_client_side → broadcast → confirmed/failed', nextAction: 'Triggered orders require explicit build/sign/broadcast action.' }),
    bundle: bundleState,
    risk: section(statusFrom(raw.riskVerdict, 'partial'), 'terminal-risk-verdict', observedAt, { verdict: raw.riskVerdict ?? null, freshWallets: raw.freshWallets ?? null, snipers: raw.snipers ?? null, bundles: raw.bundles ?? null, devTokens }, { note: noteFrom(raw.riskVerdict) ?? 'Risk quality depends on configured Helius/Birdeye/Bitquery/provider coverage.' }),
    liveReadiness: section(statusFrom(raw.liveReadiness, 'partial'), 'terminal-live-readiness-checklist', observedAt, raw.liveReadiness ?? null),
    paperTradeDecision: section(statusFrom(raw.paperTradeDecision, 'quote-required'), 'paper-trade-decision', observedAt, raw.paperTradeDecision ?? null),
    canonicalMarket: section(statusFrom(canonicalMarket, statusFrom(raw.pool, 'partial')), sourceFrom(objectValue(canonicalMarket.sourceStatus), sourceFrom(raw.pool, 'pool-index')), observedAt, canonicalMarket, { sourceStatus: canonicalMarket.sourceStatus ?? canonicalSourceStatus.market ?? null }),
    canonicalChart: section(statusFrom(canonicalChart, 'partial'), sourceFrom(canonicalChart, 'token-chart'), observedAt, canonicalChart, { candles: canonicalChart.candles ?? [], candleCount: canonicalChart.candleCount ?? (Array.isArray(canonicalChart.candles) ? canonicalChart.candles.length : 0), sourceStatus: canonicalChart.sourceStatus ?? canonicalSourceStatus.chart ?? null }),
    canonicalHolders: section(statusFrom(canonicalHolderCoverage, statusFrom(raw.holders, 'partial')), sourceFrom(canonicalHolderCoverage, sourceFrom(raw.holders, 'token-stats')), observedAt, canonicalHolderCoverage, { rows: objectValue(raw.holders).rows ?? [], sourceStatus: canonicalSourceStatus.holders ?? null }),
    canonicalSecurity: section(statusFrom(canonicalSecurity, statusFrom(raw.riskVerdict, 'partial')), sourceFrom(objectValue(canonicalSecurity.sourceStatus), 'token-stats+risk'), observedAt, canonicalSecurity, { sourceStatus: canonicalSecurity.sourceStatus ?? canonicalSourceStatus.security ?? null }),
    canonicalLiquidity: section(statusFrom(canonicalLiquidity, 'partial'), sourceFrom(objectValue(canonicalLiquidity.sourceStatus), 'lp-lock-burn-scanner'), observedAt, canonicalLiquidity, { scans: canonicalLiquidity.scans ?? [], sourceStatus: canonicalLiquidity.sourceStatus ?? canonicalSourceStatus.liquidity ?? null }),
    canonicalDiscovery: section(statusFrom(canonicalDiscovery, 'partial'), sourceFrom(objectValue(canonicalDiscovery.sourceStatus), 'gmgn-or-local-discovery'), observedAt, canonicalDiscovery, { rows: canonicalDiscovery.scannerRows ?? [], sourceStatus: canonicalDiscovery.sourceStatus ?? canonicalSourceStatus.discovery ?? null }),
    sourceStatus: section(Object.keys(canonicalSourceStatus).length ? 'ok' : 'partial', 'canonical-section-metadata', observedAt, canonicalSourceStatus),
    providerHealth: providerStatus(raw, observedAt),
    executionCapabilities: section(statusFrom(capabilities, 'ok'), 'execution-capabilities', observedAt, capabilities, { liveTradingEnabled: objectValue(capabilities).liveTradingEnabled ?? false })
  };
}

export async function GET(request: Request) {
  const { origin, search, searchParams } = new URL(request.url);
  const prototype = searchParams.get('profile') === 'prototype' || searchParams.get('prototype') === '1';
  const fastPrimary = searchParams.get('fastPrimary') === '1' || (searchParams.get('profile') === 'live-read' && searchParams.get('enrich') !== '1');
  const [response, providerReadinessResponse] = await Promise.all([
    fetch(`${origin}/api/terminal-token-snapshot${search}`, { cache: 'no-store' }),
    prototype || fastPrimary ? Promise.resolve(null) : fetch(`${origin}/api/provider-readiness`, { cache: 'no-store' }).catch(() => null)
  ]);
  const providerReadiness = providerReadinessResponse?.ok ? await providerReadinessResponse.json().catch(() => null) : null;
  const raw = await response.json().catch(() => ({ status: 'error', error: 'Terminal token snapshot returned invalid JSON.' })) as Json;
  const observedAt = typeof raw.observedAt === 'string' ? raw.observedAt : new Date().toISOString();
  const normalized = normalize(raw, observedAt);
  return Response.json({
    contract: 'terminal-snapshot-v1',
    status: response.ok ? (typeof raw.status === 'string' ? raw.status : 'ok') : 'partial',
    source: 'terminal-snapshot',
    observedAt,
    note: response.ok ? null : `terminal-token-snapshot returned HTTP ${response.status}`,
    normalized: { ...normalized, providerReadiness: providerReadiness ?? normalized.providerHealth },
    providerReadiness,
    ...raw
  }, { status: response.ok ? 200 : response.status });
}
