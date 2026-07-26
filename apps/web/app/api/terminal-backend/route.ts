import { hydrateWalletBalances, displayWalletSol } from '../../../lib/chain-hydration';
import { getMeridianStore, getProject, projectFlow, walletsForGroup } from '../../../lib/meridian-store';
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

function summarizeTokenBalances(payload: null | { wallets?: Array<{ wallet?: { id?: string; address?: string; role?: string }; balance?: { uiAmount?: number | null; rawAmount?: string } }> }) {
  const wallets = payload?.wallets ?? [];
  return {
    walletCount: wallets.length,
    nonZeroWallets: wallets.filter((row) => (row.balance?.uiAmount ?? 0) > 0).length,
    totalUiAmount: wallets.reduce((sum, row) => sum + (row.balance?.uiAmount ?? 0), 0),
    rows: wallets.map((row) => ({ id: row.wallet?.id ?? null, address: row.wallet?.address ?? null, role: row.wallet?.role ?? null, uiAmount: row.balance?.uiAmount ?? 0, rawAmount: row.balance?.rawAmount ?? '0' }))
  };
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim() ?? '';
  const projectId = searchParams.get('project')?.trim() ?? '';
  const store = getMeridianStore();
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

  const [providerReadiness, capabilities, walletOps, deployment, terminalOrders, bundleSequencer, pool, lp, bundle, fresh, devSold, tokenBalances] = await Promise.all([
    readJson(origin, '/api/provider-readiness'),
    readJson(origin, '/api/execution-capabilities'),
    readJson(origin, '/api/wallet-ops-engine'),
    readJson(origin, '/api/deployment-engine'),
    readJson(origin, mint && ADDRESS_RE.test(mint) ? `/api/terminal-order-engine?mint=${encodeURIComponent(mint)}&status=all` : '/api/terminal-order-engine?status=all'),
    readJson(origin, '/api/bundle-sequencer'),
    mint && ADDRESS_RE.test(mint) ? readJson(origin, `/api/token-pool-index?mint=${encodeURIComponent(mint)}`) : null,
    mint && ADDRESS_RE.test(mint) ? readJson(origin, `/api/lp-lock-burn-scanner?mint=${encodeURIComponent(mint)}`) : null,
    mint && ADDRESS_RE.test(mint) ? readJson(origin, `/api/bundle-clustering-index?mint=${encodeURIComponent(mint)}&limit=100`) : null,
    mint && ADDRESS_RE.test(mint) ? readJson(origin, `/api/fresh-wallet-classifier?mint=${encodeURIComponent(mint)}&limit=100`) : null,
    mint && ADDRESS_RE.test(mint) ? readJson(origin, `/api/dev-sold-classifier?mint=${encodeURIComponent(mint)}&devWallets=${encodeURIComponent(wallets.map((wallet) => wallet.address).join(','))}&limit=100`) : null,
    mint && ADDRESS_RE.test(mint) ? readJson(origin, `/api/wallet-token-balances?mint=${encodeURIComponent(mint)}`) : null
  ]);

  const liveTradingEnabled = (capabilities as { liveTradingEnabled?: boolean } | null)?.liveTradingEnabled === true;
  const walletTokenSummary = summarizeTokenBalances(tokenBalances as null | { wallets?: Array<{ wallet?: { id?: string; address?: string; role?: string }; balance?: { uiAmount?: number | null; rawAmount?: string } }> });
  const bundleWallets = wallets.slice(0, Math.min(4, wallets.length));
  const bundleSolAvailable = bundleWallets.reduce((sum, wallet) => sum + wallet.solBalance, 0);
  const projectFlowSummary = selectedProject ? projectFlow(selectedProject.id, store) : null;
  const rpc = configuredSolanaRpc();

  return Response.json({
    status: 'ok',
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
      tokenBalances: { ...walletTokenSummary, confidence: 'high', historyCoverage: 'rpc-current-holdings', missingProviders: [], note: 'Current token balances are read from RPC; this is not historical PnL.' }
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
    accounting: projectFlowSummary ? { ...projectFlowSummary, confidence: 'estimated', historyCoverage: 'local-accounting-only', missingProviders: ['helius', 'birdeye'], note: 'Terminal accounting is local flow history only unless provider transaction history is configured.' } : null,
    hardwire: {
      terminalBackend: '/api/terminal-backend',
      sourceOfTruth: 'UI should render these backend states instead of local fallback strings.'
    }
  });
}
