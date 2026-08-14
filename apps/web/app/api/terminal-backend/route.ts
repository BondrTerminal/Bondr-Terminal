import { hydrateWalletBalances, displayWalletSol } from '../../../lib/chain-hydration';
import { getProject, projectFlow, walletsForGroup } from '../../../lib/meridian-store';
import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type JsonObject = Record<string, unknown>;

async function readJson<T = JsonObject>(origin: string, path: string): Promise<T | null> {
  try {
    const response = await fetch(`${origin}${path}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

function summarizeTokenBalances(payload: null | { status?: string; provider?: string; confidence?: string; historyCoverage?: string; missingProviders?: string[]; note?: string; wallets?: Array<{ wallet?: { id?: string; address?: string; role?: string }; balance?: { uiAmount?: number | null; rawAmount?: string }; id?: string | null; address?: string | null; role?: string | null; groupId?: string | null; scope?: string | null; uiAmount?: number | null; uiAmountString?: string; rawAmount?: string; status?: string; balanceStatus?: string; source?: string; tokenAccounts?: unknown[]; tokenAccountCount?: number }> }) {
  const wallets = payload?.wallets ?? [];
  const rows = wallets.map((row) => {
    const uiAmount = row.balance?.uiAmount ?? row.uiAmount ?? 0;
    const address = row.wallet?.address ?? row.address ?? null;
    const status = row.status ?? row.balanceStatus ?? payload?.status ?? 'unknown';
    return {
      id: row.wallet?.id ?? row.id ?? null,
      wallet: address,
      address,
      role: row.wallet?.role ?? row.role ?? null,
      groupId: row.groupId ?? null,
      scope: row.scope ?? null,
      tokenAccounts: row.tokenAccounts ?? [],
      tokenAccountCount: row.tokenAccountCount ?? (Array.isArray(row.tokenAccounts) ? row.tokenAccounts.length : 0),
      uiAmount,
      uiAmountString: row.uiAmountString ?? String(uiAmount),
      rawAmount: row.balance?.rawAmount ?? row.rawAmount ?? '0',
      source: row.source ?? 'wallet-token-balances',
      status,
      balanceStatus: row.balanceStatus ?? status
    };
  });
  return {
    walletCount: rows.length,
    nonZeroWallets: rows.filter((row) => row.uiAmount > 0).length,
    totalUiAmount: rows.reduce((sum, row) => sum + row.uiAmount, 0),
    rows,
    status: payload?.status ?? 'unknown',
    provider: payload?.provider ?? null,
    confidence: payload?.confidence ?? 'unknown',
    historyCoverage: payload?.historyCoverage ?? 'unknown',
    missingProviders: payload?.missingProviders ?? [],
    note: payload?.note ?? null
  };
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function routeStatus(value: unknown, source: string, required = false) {
  const object = objectValue(value);
  const status = typeof object.status === 'string'
    ? object.status
    : typeof object.execution === 'string'
      ? object.execution
      : Object.keys(object).length ? 'ok' : 'unavailable';
  const degraded = value === null || ['error', 'unavailable', 'missing', 'not-configured'].some((needle) => status.includes(needle));
  const deferred = status.includes('deferred') || status.includes('primary-fast');
  const note = typeof object.note === 'string' ? object.note : typeof object.error === 'string' ? object.error : null;
  return {
    status: value === null ? 'unavailable' : status,
    source,
    required,
    observedAt: new Date().toISOString(),
    note,
    blockers: degraded && !deferred ? [note ?? `${source} returned ${value === null ? 'null/unavailable' : status}`] : [],
    nextCredentialNeeded: typeof object.nextCredentialNeeded === 'string' ? object.nextCredentialNeeded : null
  };
}

function backendStatus(sections: Array<ReturnType<typeof routeStatus>>) {
  const requiredFailures = sections.filter((section) => section.required && section.blockers.length);
  const anyDeferred = sections.some((section) => String(section.status).includes('deferred') || String(section.status).includes('primary-fast'));
  if (requiredFailures.length) return 'partial';
  if (anyDeferred) return 'partial';
  return 'ok';
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim() ?? '';
  const projectId = searchParams.get('project')?.trim() ?? '';
  const fast = searchParams.get('fast') === '1';
  const store = await getMeridianWalletStore();
  const selectedProject = projectId ? getProject(projectId, store) : undefined;
  const projectWallets = selectedProject ? walletsForGroup(selectedProject.walletGroupId, store).filter((wallet) => !wallet.archived) : [];
  const globalWallets = store.wallets.filter((wallet) => wallet.scope === 'global' && !wallet.archived);
  const tradingLabWallets = store.wallets.filter((wallet) => wallet.groupId === 'trading-lab' && !wallet.archived);
  const walletMap = new Map([...projectWallets, ...tradingLabWallets, ...globalWallets].map((wallet) => [wallet.id, wallet]));
  const hydrated = await hydrateWalletBalances([...walletMap.values()].slice(0, 25));
  const wallets = hydrated.wallets.map((wallet) => ({
    id: wallet.id,
    role: wallet.role,
    address: wallet.address,
    scope: wallet.scope,
    groupId: wallet.groupId,
    purpose: wallet.purpose,
    status: wallet.status,
    solBalance: displayWalletSol(wallet),
    chainBalanceSol: wallet.chainBalanceSol,
    balanceStatus: wallet.balanceStatus,
    balanceSource: wallet.balanceSource,
    balanceNote: wallet.balanceNote
  }));

  const [providerReadiness, capabilities, walletOps, deployment, terminalOrders, bundleSequencer, executionTruthMap, pool, lp, bundle, fresh, devSold, tokenBalances] = await Promise.all([
    fast ? Promise.resolve({ status: 'primary-fast-deferred', source: 'terminal-backend-fast' }) : readJson(origin, '/api/provider-readiness'),
    readJson(origin, '/api/execution-capabilities'),
    fast ? Promise.resolve({ status: 'primary-fast-deferred', source: 'terminal-backend-fast' }) : readJson(origin, '/api/wallet-ops-engine'),
    fast ? Promise.resolve({ status: 'primary-fast-deferred', source: 'terminal-backend-fast' }) : readJson(origin, '/api/deployment-engine'),
    fast ? Promise.resolve({ orders: [], execution: 'primary-fast-deferred' }) : readJson(origin, mint && ADDRESS_RE.test(mint) ? `/api/terminal-order-engine?mint=${encodeURIComponent(mint)}&status=all` : '/api/terminal-order-engine?status=all'),
    fast ? Promise.resolve({ execution: 'primary-fast-deferred' }) : readJson(origin, '/api/bundle-sequencer'),
    fast ? Promise.resolve({ status: 'primary-fast-deferred', source: 'terminal-backend-fast' }) : readJson(origin, `/api/execution-truth-map${projectId ? `?project=${encodeURIComponent(projectId)}` : ''}`),
    mint && ADDRESS_RE.test(mint) ? readJson(origin, `/api/token-pool-index?mint=${encodeURIComponent(mint)}`) : null,
    fast ? Promise.resolve({ status: 'primary-fast-deferred', source: 'terminal-backend-fast' }) : mint && ADDRESS_RE.test(mint) ? readJson(origin, `/api/lp-lock-burn-scanner?mint=${encodeURIComponent(mint)}`) : null,
    fast ? Promise.resolve({ status: 'primary-fast-deferred', clusters: [] }) : mint && ADDRESS_RE.test(mint) ? readJson(origin, `/api/bundle-clustering-index?mint=${encodeURIComponent(mint)}&limit=100`) : null,
    fast ? Promise.resolve({ status: 'primary-fast-deferred', rows: [] }) : mint && ADDRESS_RE.test(mint) ? readJson(origin, `/api/fresh-wallet-classifier?mint=${encodeURIComponent(mint)}&limit=100`) : null,
    fast ? Promise.resolve({ status: 'primary-fast-deferred', wallets: [] }) : mint && ADDRESS_RE.test(mint) ? readJson(origin, `/api/dev-sold-classifier?mint=${encodeURIComponent(mint)}&devWallets=${encodeURIComponent(wallets.map((wallet) => wallet.address).join(','))}&limit=100`) : null,
    mint && ADDRESS_RE.test(mint) ? readJson(origin, `/api/wallet-token-balances?mint=${encodeURIComponent(mint)}`) : null
  ]);

  const liveTradingEnabled = (capabilities as { liveTradingEnabled?: boolean } | null)?.liveTradingEnabled === true;
  const walletTokenSummary = summarizeTokenBalances(tokenBalances as null | { wallets?: Array<{ wallet?: { id?: string; address?: string; role?: string }; balance?: { uiAmount?: number | null; rawAmount?: string } }> });
  const bundleWallets = wallets.slice(0, Math.min(4, wallets.length));
  const bundleSolAvailable = bundleWallets.reduce((sum, wallet) => sum + wallet.solBalance, 0);
  const projectFlowSummary = selectedProject ? projectFlow(selectedProject.id, store) : null;
  const rpc = configuredSolanaRpc();
  const sourceStatus = {
    providerReadiness: routeStatus(providerReadiness, 'provider-readiness', !fast),
    capabilities: routeStatus(capabilities, 'execution-capabilities', true),
    walletOps: routeStatus(walletOps, 'wallet-ops-engine', !fast),
    deployment: routeStatus(deployment, 'deployment-engine', !fast),
    terminalOrders: routeStatus(terminalOrders, 'terminal-order-engine', !fast),
    bundleSequencer: routeStatus(bundleSequencer, 'bundle-sequencer', !fast),
    executionTruthMap: routeStatus(executionTruthMap, 'execution-truth-map', !fast),
    poolIndex: routeStatus(pool, 'token-pool-index', Boolean(mint && ADDRESS_RE.test(mint))),
    lpScanner: routeStatus(lp, 'lp-lock-burn-scanner', Boolean(mint && ADDRESS_RE.test(mint) && !fast)),
    walletTokenBalances: routeStatus(tokenBalances, 'wallet-token-balances', Boolean(mint && ADDRESS_RE.test(mint)))
  };
  const status = backendStatus(Object.values(sourceStatus));
  const providerSources = objectValue((providerReadiness as JsonObject | null)?.sources);
  const historyProviders = ['helius', 'birdeye'].filter((provider) => {
    const source = objectValue(providerSources[provider]);
    return source.status === 'ok' || source.status === 'public-fallback';
  });

  return Response.json({
    status,
    observedAt: new Date().toISOString(),
    mint: mint || null,
    project: selectedProject ? { id: selectedProject.id, name: selectedProject.name, ticker: selectedProject.ticker, status: selectedProject.status, walletGroupId: selectedProject.walletGroupId } : null,
    rpc: { provider: rpc.provider, configured: rpc.configured, enhancedTransactions: rpc.enhancedTransactions },
    providerReadiness,
    execution: {
      liveTradingEnabled,
      signer: 'browser-wallet',
      capabilities,
      walletOps,
      deployment,
      terminalOrders,
      bundleSequencer,
      executionTruthMap,
      orderEngine: {
        marketSwap: liveTradingEnabled ? 'unsigned-jupiter-swap-builder-ready' : 'quote-and-order-store-ready-live-disabled',
        limitOrders: '/api/terminal-order-engine create/list/evaluate/cancel/replace',
        stopLossTakeProfit: '/api/terminal-order-engine take-profit/stop-loss triggers',
        multiWalletBundle: '/api/bundle-sequencer preflight/build unsigned per-wallet Jupiter transactions',
        cancelReplace: '/api/terminal-order-engine cancel/replace'
      }
    },
    wallets: {
      provider: hydrated.provider,
      configured: hydrated.configured,
      count: wallets.length,
      totalSol: wallets.reduce((sum, wallet) => sum + wallet.solBalance, 0),
      liveBalanceCount: wallets.filter((wallet) => wallet.balanceStatus === 'live').length,
      rows: wallets,
      tokenBalances: { ...walletTokenSummary, confidence: walletTokenSummary.confidence ?? 'high', historyCoverage: walletTokenSummary.historyCoverage ?? 'rpc-current-holdings', missingProviders: walletTokenSummary.missingProviders ?? [], note: walletTokenSummary.note ?? 'Current token balances are read from RPC; this is not historical PnL.' }
    },
    bundle: {
      selectedWalletCount: bundleWallets.length,
      solAvailable: bundleSolAvailable,
      walletIds: bundleWallets.map((wallet) => wallet.id),
      engineStatus: (bundleSequencer as { execution?: string } | null)?.execution ?? 'bundle-sequencer-unavailable',
      index: bundle,
      sequencer: bundleSequencer
    },
    liquidity: { poolIndex: pool, lpScanner: lp },
    classifiers: { freshWallets: fresh, devSold },
    accounting: projectFlowSummary ? { ...projectFlowSummary, confidence: 'estimated', historyCoverage: historyProviders.length ? `local-accounting-plus-${historyProviders.join('-')}-available` : 'local-accounting-only', missingProviders: ['helius', 'birdeye'].filter((provider) => !historyProviders.includes(provider)), note: historyProviders.length ? `Provider history available for ${historyProviders.join(', ')}; accounting remains local until wallet-history PnL is explicitly reconciled.` : 'Terminal accounting is local flow history only unless provider transaction history is configured.' } : null,
    sourceStatus,
    hardwire: {
      terminalBackend: '/api/terminal-backend',
      sourceOfTruth: 'Terminal Intelligence and Liquidity Engine should prefer /api/terminal/snapshot for token-scoped market/liquidity truth; this route reports execution/wallet backend readiness.'
    }
  });
}
