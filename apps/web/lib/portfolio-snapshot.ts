import { Connection, PublicKey } from '@solana/web3.js';
import { displayWalletSol, hydrateWalletBalances } from './chain-hydration';
import { allProjectFlow, projectFlow, walletBalanceSummary, type FlowEvent, type MeridianStore } from './meridian-store';
import { getMeridianWalletStore } from './durable-wallet-store';
import { configuredSolanaRpc } from './solana-rpc';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const MAX_WALLETS_TO_SCAN = Number(process.env.PORTFOLIO_MAX_WALLETS_TO_SCAN ?? '24');
const MAX_PRICE_IDS = 100;
const RPC_TIMEOUT_MS = 8_000;

type Json = Record<string, unknown>;

type Section<T> = {
  status: 'ok' | 'partial' | 'unavailable' | 'public-fallback' | 'optional-not-configured' | 'blocked-by-live-gate' | 'error' | 'estimated';
  source: string;
  observedAt: string;
  note?: string | null;
  error?: string | null;
  data: T;
};

export type PortfolioSnapshot = {
  contract: 'portfolio-v1';
  status: 'ok' | 'partial';
  source: 'meridian-portfolio';
  observedAt: string;
  providerHealth: Section<Record<string, Json>>;
  wallets: Section<{ count: number; scannedCount: number; totalSol: number; totalUsd: number | null; rows: Json[] }>;
  holdings: Section<{ tokenCount: number; rows: Json[] }>;
  positions: Section<{ active: Json[]; history: Json[]; top100: Json[] }>;
  performance: Section<Json>;
  activity: Section<{ rows: Json[] }>;
  execution: Section<Json>;
  blockingIssues: string[];
  optionalProviderGaps: string[];
  providerNotes: string[];
  gaps: string[];
};

function section<T>(status: Section<T>['status'], source: string, observedAt: string, data: T, note?: string | null, error?: string | null): Section<T> {
  return { status, source, observedAt, note: note ?? null, error: error ?? null, data };
}

function envConfigured(name: string) {
  return Boolean(process.env[name]?.trim());
}

function providerHealth(observedAt: string) {
  const rpc = configuredSolanaRpc();
  const sources: Record<string, Json> = {
    helius: {
      status: rpc.provider === 'helius-rpc-url' || rpc.provider === 'helius-api-key' ? 'ok' : 'optional-not-configured',
      source: 'helius',
      observedAt,
      configured: rpc.provider === 'helius-rpc-url' || rpc.provider === 'helius-api-key',
      note: rpc.provider === 'helius-rpc-url' || rpc.provider === 'helius-api-key' ? 'Helius available for RPC/enrichment.' : 'Missing HELIUS_API_KEY or HELIUS_RPC_URL; enhanced wallet history/PnL unavailable.'
    },
    birdeye: {
      status: envConfigured('BIRDEYE_API_KEY') ? 'ok' : 'optional-not-configured',
      source: 'birdeye',
      observedAt,
      configured: envConfigured('BIRDEYE_API_KEY'),
      note: envConfigured('BIRDEYE_API_KEY') ? 'Birdeye available for token transactions.' : 'Missing BIRDEYE_API_KEY; token trade history is limited.'
    },
    bitquery: {
      status: envConfigured('BITQUERY_API_KEY') ? 'ok' : 'optional-not-configured',
      source: 'bitquery',
      observedAt,
      configured: envConfigured('BITQUERY_API_KEY'),
      note: envConfigured('BITQUERY_API_KEY') ? 'Bitquery available for bundle/same-block analysis.' : 'Missing BITQUERY_API_KEY; deep bundle clustering unavailable.'
    },
    solanaRpc: {
      status: rpc.configured ? 'ok' : 'public-fallback',
      source: rpc.provider,
      observedAt,
      configured: rpc.configured,
      note: rpc.configured ? 'Configured RPC selected.' : 'Using public Solana RPC fallback; scans can rate-limit.'
    },
    jupiter: {
      status: 'ok',
      source: 'jupiter-price-v3',
      observedAt,
      configured: true,
      note: 'No-key price fallback used for portfolio valuation where token price is available.'
    },
    dexscreenerGeckoterminal: {
      status: 'ok',
      source: 'dexscreener/geckoterminal',
      observedAt,
      configured: true,
      note: 'No-key market fallback available through existing token routes.'
    }
  };
  return section('ok', 'provider-health', observedAt, sources);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = RPC_TIMEOUT_MS): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('RPC request timed out.')), timeoutMs))
  ]);
}

async function walletTokenAccounts(connection: Connection, walletAddress: string) {
  const owner = new PublicKey(walletAddress);
  const response = await withTimeout(connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, 'confirmed'));
  return response.value.map((item) => {
    const parsed = item.account.data.parsed as { info?: { mint?: string; tokenAmount?: { uiAmount?: number | null; amount?: string; decimals?: number } } };
    const info = parsed.info ?? {};
    return {
      tokenAccount: item.pubkey.toBase58(),
      wallet: walletAddress,
      mint: info.mint ?? '',
      uiAmount: info.tokenAmount?.uiAmount ?? 0,
      rawAmount: info.tokenAmount?.amount ?? '0',
      decimals: info.tokenAmount?.decimals ?? null
    };
  }).filter((row) => row.mint && row.uiAmount > 0);
}

async function fetchPrices(mints: string[]) {
  const ids = [SOL_MINT, ...mints.filter((mint) => mint !== SOL_MINT)].slice(0, MAX_PRICE_IDS);
  if (!ids.length) return new Map<string, number>();
  try {
    const response = await fetch(`https://lite-api.jup.ag/price/v3?ids=${ids.map(encodeURIComponent).join(',')}`, { cache: 'no-store' });
    if (!response.ok) return new Map<string, number>();
    const payload = await response.json() as Record<string, { usdPrice?: number; price?: number }>;
    const map = new Map<string, number>();
    for (const [mint, row] of Object.entries(payload)) {
      const price = row.usdPrice ?? row.price;
      if (typeof price === 'number' && Number.isFinite(price)) map.set(mint, price);
    }
    return map;
  } catch {
    return new Map<string, number>();
  }
}

function pnlBucket(pct: number | null) {
  if (pct === null || !Number.isFinite(pct)) return 'unavailable';
  if (pct > 500) return '>500%';
  if (pct >= 200) return '200% ~ 500%';
  if (pct >= 0) return '0% ~ 200%';
  if (pct >= -50) return '0% ~ -50%';
  return '< -50%';
}

function flowHistory(rows: FlowEvent[], solUsd: number | null) {
  return rows.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((event) => ({
    id: event.id,
    projectId: event.projectId,
    timestamp: event.timestamp,
    type: event.type,
    tokenAmount: event.tokenAmount,
    solAmount: event.solAmount,
    usdAmount: solUsd !== null ? event.solAmount * solUsd : null,
    source: 'meridian-flow-events',
    pnlStatus: 'accounting-only'
  }));
}

export async function buildPortfolioSnapshot(storeOverride?: MeridianStore): Promise<PortfolioSnapshot> {
  const observedAt = new Date().toISOString();
  const store = storeOverride ?? await getMeridianWalletStore();
  const rpc = configuredSolanaRpc();
  const health = providerHealth(observedAt);
  const hydration = await hydrateWalletBalances(store.wallets);
  const activeWallets = hydration.wallets.filter((wallet) => !wallet.archived);
  const walletsToScan = activeWallets.slice(0, MAX_WALLETS_TO_SCAN);
  const connection = new Connection(rpc.url, 'confirmed');
  let tokenAccounts: Array<{ tokenAccount: string; wallet: string; mint: string; uiAmount: number; rawAmount: string; decimals: number | null }> = [];
  let holdingsError: string | null = null;

  try {
    const chunks = await Promise.all(walletsToScan.map((wallet) => walletTokenAccounts(connection, wallet.address).catch((error) => {
      holdingsError = error instanceof Error ? error.message : 'SPL token scan failed.';
      return [];
    })));
    tokenAccounts = chunks.flat();
  } catch (error) {
    holdingsError = error instanceof Error ? error.message : 'SPL token scan failed.';
  }

  const mints = Array.from(new Set(tokenAccounts.map((row) => row.mint)));
  const prices = await fetchPrices(mints);
  const solUsd = prices.get(SOL_MINT) ?? null;
  const projectByMint = new Map(store.projects.filter((project) => project.tokenMint).map((project) => [project.tokenMint!, project]));
  const holdingsByMint = new Map<string, { mint: string; uiAmount: number; rawAmount: bigint; walletCount: number; tokenAccounts: typeof tokenAccounts; priceUsd: number | null; valueUsd: number | null }>();

  for (const account of tokenAccounts) {
    const current = holdingsByMint.get(account.mint) ?? { mint: account.mint, uiAmount: 0, rawAmount: BigInt(0), walletCount: 0, tokenAccounts: [], priceUsd: prices.get(account.mint) ?? null, valueUsd: null };
    current.uiAmount += account.uiAmount;
    current.rawAmount += BigInt(account.rawAmount || '0');
    current.tokenAccounts.push(account);
    current.walletCount = new Set(current.tokenAccounts.map((row) => row.wallet)).size;
    current.valueUsd = current.priceUsd !== null ? current.uiAmount * current.priceUsd : null;
    holdingsByMint.set(account.mint, current);
  }

  const holdingRows = Array.from(holdingsByMint.values()).map((row) => {
    const project = projectByMint.get(row.mint);
    return {
      mint: row.mint,
      name: project?.name ?? null,
      symbol: project?.ticker ?? null,
      uiAmount: row.uiAmount,
      rawAmount: row.rawAmount.toString(),
      walletCount: row.walletCount,
      priceUsd: row.priceUsd,
      valueUsd: row.valueUsd,
      tokenAccounts: row.tokenAccounts,
      source: 'solana-rpc-getParsedTokenAccountsByOwner+jupiter-price-v3',
      observedAt
    };
  }).sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  const history = flowHistory(store.flowEvents, solUsd);
  const positions = store.projects.map((project) => {
    const pf = projectFlow(project.id, store);
    const flowRows = store.flowEvents.filter((event) => event.projectId === project.id);
    const bought = flowRows.filter((event) => event.type === 'buy').reduce((sum, event) => sum + event.tokenAmount, 0);
    const sold = flowRows.filter((event) => event.type === 'sell').reduce((sum, event) => sum + event.tokenAmount, 0);
    const holding = project.tokenMint ? holdingsByMint.get(project.tokenMint) : undefined;
    const remaining = holding?.uiAmount ?? Math.max(0, bought - sold);
    const currentValueUsd = holding?.valueUsd ?? null;
    const realizedPnlUsd = solUsd !== null && pf.sellsSol ? (pf.sellsSol - Math.min(pf.buysSol, pf.sellsSol)) * solUsd : null;
    const costBasisUsd = solUsd !== null ? pf.buysSol * solUsd : null;
    const unrealizedPnlUsd = costBasisUsd !== null && currentValueUsd !== null ? currentValueUsd - Math.max(0, costBasisUsd - (solUsd !== null ? pf.sellsSol * solUsd : 0)) : null;
    const totalPnlUsd = realizedPnlUsd !== null || unrealizedPnlUsd !== null ? (realizedPnlUsd ?? 0) + (unrealizedPnlUsd ?? 0) : null;
    const pnlPct = costBasisUsd && totalPnlUsd !== null ? (totalPnlUsd / costBasisUsd) * 100 : null;
    const pnlStatus = holding && flowRows.length ? 'estimated-from-rpc-holdings-and-local-accounting' : flowRows.length ? 'estimated-from-local-accounting' : 'unavailable';
    return {
      projectId: project.id,
      name: project.name,
      symbol: project.ticker,
      mint: project.tokenMint,
      bought,
      sold,
      remaining,
      currentValueUsd,
      realizedPnlUsd,
      unrealizedPnlUsd,
      totalPnlUsd,
      pnlPct,
      pnlBucket: pnlBucket(pnlPct),
      txCount: flowRows.length,
      status: remaining > 0 ? 'active' : 'history',
      pnlStatus,
      confidence: pnlStatus.includes('rpc') || pnlStatus.includes('accounting') ? 'estimated' : 'unavailable',
      historyCoverage: pnlStatus.includes('rpc') ? 'rpc-current-holdings' : flowRows.length ? 'local-accounting-only' : 'unavailable',
      missingProviders: [!envConfigured('HELIUS_API_KEY') && !envConfigured('HELIUS_RPC_URL') ? 'helius' : null, !envConfigured('BIRDEYE_API_KEY') ? 'birdeye' : null].filter(Boolean),
      note: pnlStatus.includes('rpc') ? 'PnL estimated from current RPC holdings plus local accounting, not complete provider transaction history.' : flowRows.length ? 'PnL estimated from local accounting only.' : 'PnL unavailable without position/trade history.',
      source: pnlStatus.includes('rpc') ? 'solana-rpc+meridian-flow-events+jupiter-price-v3' : 'meridian-flow-events',
      observedAt
    };
  });

  const totalSol = activeWallets.reduce((sum, wallet) => sum + displayWalletSol(wallet), 0);
  const totalWalletUsd = solUsd !== null ? totalSol * solUsd : null;
  const totalHoldingsUsd = holdingRows.reduce((sum, row) => sum + (row.valueUsd ?? 0), 0);
  const totalValueUsd = (totalWalletUsd ?? 0) + totalHoldingsUsd;
  const flow = allProjectFlow(store);
  const realizedPnlUsd = solUsd !== null ? (flow.sellsSol - Math.min(flow.buysSol, flow.sellsSol)) * solUsd : null;
  const unrealizedPnlUsd = positions.some((row) => row.unrealizedPnlUsd !== null) ? positions.reduce((sum, row) => sum + (row.unrealizedPnlUsd ?? 0), 0) : null;
  const totalPnlUsd = realizedPnlUsd !== null || unrealizedPnlUsd !== null ? (realizedPnlUsd ?? 0) + (unrealizedPnlUsd ?? 0) : null;
  const active = positions.filter((row) => row.status === 'active' || row.mint);
  const top100 = positions.slice().sort((a, b) => Math.abs(b.totalPnlUsd ?? 0) - Math.abs(a.totalPnlUsd ?? 0)).slice(0, 100);
  const buckets = ['>500%', '200% ~ 500%', '0% ~ 200%', '0% ~ -50%', '< -50%'] as const;
  const walletActivity = walletBalanceSummary(store).activity;

  const optionalProviderGaps = [
    !envConfigured('HELIUS_API_KEY') && !envConfigured('HELIUS_RPC_URL') ? 'Helius optional: add HELIUS_API_KEY or HELIUS_RPC_URL for enhanced transaction history.' : null,
    !envConfigured('BIRDEYE_API_KEY') ? 'Birdeye optional: add BIRDEYE_API_KEY for preferred token transaction rows.' : null,
    !envConfigured('BITQUERY_API_KEY') ? 'Bitquery optional: add BITQUERY_API_KEY for deep same-block/bundle clustering.' : null
  ].filter((item): item is string => Boolean(item));
  const providerNotes = [
    rpc.configured ? `Solana RPC configured via ${rpc.provider}.` : 'Solana RPC using public fallback; live balances/holdings can still load but may rate-limit.',
    prices.size ? 'Jupiter price fallback returned portfolio prices.' : 'Jupiter price fallback returned no portfolio prices for current holdings.',
    optionalProviderGaps.length ? 'Optional paid providers are not required for this page to load.' : 'Optional paid providers configured.'
  ];
  const blockingIssues = [
    holdingsError && tokenAccounts.length === 0 ? `SPL holding scan failed: ${holdingsError}` : null,
    !hydration.wallets.length ? 'No wallet records available for portfolio.' : null
  ].filter((item): item is string => Boolean(item));
  const gaps = [...blockingIssues, ...optionalProviderGaps, ...providerNotes];

  return {
    contract: 'portfolio-v1',
    status: blockingIssues.length ? 'partial' : 'ok',
    source: 'meridian-portfolio',
    observedAt,
    providerHealth: health,
    wallets: section(hydration.wallets.some((wallet) => wallet.balanceStatus === 'live') ? 'ok' : 'partial', 'meridian-store+solana-rpc', observedAt, {
      count: activeWallets.length,
      scannedCount: walletsToScan.length,
      totalSol,
      totalUsd: totalWalletUsd,
      rows: activeWallets.map((wallet) => ({
        id: wallet.id,
        role: wallet.role,
        address: wallet.address,
        scope: wallet.scope,
        groupId: wallet.groupId,
        status: wallet.status,
        solBalance: displayWalletSol(wallet),
        solValueUsd: solUsd !== null ? displayWalletSol(wallet) * solUsd : null,
        balanceStatus: wallet.balanceStatus,
        balanceSource: wallet.balanceSource,
        note: wallet.balanceNote
      }))
    }),
    holdings: section(holdingsError ? 'partial' : 'ok', 'solana-rpc+jupiter-price-v3', observedAt, { tokenCount: holdingRows.length, rows: holdingRows }, holdingRows.length ? null : 'No non-zero SPL token holdings found in scanned wallets.', holdingsError),
    positions: section('estimated', 'portfolio-contract', observedAt, { active, history, top100 }, 'PnL is estimated unless backed by complete wallet-attributed trade history.'),
    performance: section('estimated', 'meridian-flow-events+portfolio-contract', observedAt, {
      totalValueUsd,
      tradeableBalanceUsd: totalWalletUsd,
      realizedPnlUsd,
      unrealizedPnlUsd,
      totalPnlUsd,
      totalTxns: history.length,
      buys: history.filter((row) => row.type === 'buy').length,
      sells: history.filter((row) => row.type === 'sell').length,
      buckets: Object.fromEntries(buckets.map((bucket) => [bucket, positions.filter((row) => row.pnlBucket === bucket).length])),
      pnlStatus: positions.some((row) => String(row.pnlStatus).startsWith('estimated')) ? 'estimated' : 'unavailable',
      confidence: positions.some((row) => String(row.pnlStatus).startsWith('estimated')) ? 'estimated' : 'unavailable',
      historyCoverage: holdingRows.length ? 'rpc-current-holdings' : history.length ? 'local-accounting-only' : 'unavailable',
      missingProviders: optionalProviderGaps,
      note: 'Full high-confidence PnL requires provider-backed wallet transaction history.'
    }, 'Realized/unrealized PnL uses local accounting plus live holdings when available; full external wallet history needs provider keys.'),
    activity: section(walletActivity.length ? 'ok' : 'partial', 'meridian-wallet-activity', observedAt, { rows: walletActivity }, walletActivity.length ? null : 'No wallet activity recorded.'),
    execution: section('ok', 'execution-gates', observedAt, {
      liveTradingEnabled: process.env.LIVE_TRADING_ENABLED === 'true',
      transactionFlow: ['preflight', 'unsigned_transaction_build', 'browser_wallet_signing', 'explicit_broadcast'],
      bundleRelaySubmission: false,
      ordersAutoBroadcast: false,
      note: 'Portfolio is read-only; execution remains gated and explicit.'
    }),
    blockingIssues,
    optionalProviderGaps,
    providerNotes,
    gaps
  };
}
