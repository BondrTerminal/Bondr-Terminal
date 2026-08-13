export const dynamic = 'force-dynamic';

type Json = Record<string, unknown>;
type Confidence = 'low' | 'medium' | 'high';
type Relationship = 'creator' | 'configured-dev' | 'funded-by-seed' | 'funded-seed' | 'shared-funder' | 'direct-token-transfer' | 'early-buyer-cluster' | 'bundle-overlap' | 'rugcheck-network';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TIMEOUT_MS = 12_000;

function objectValue(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function numberOrNull(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function parseWallets(raw: string | null): string[] {
  return Array.from(new Set((raw ?? '').split(',').map((value) => value.trim()).filter((value) => ADDRESS_RE.test(value))));
}

async function readJson<T = Json>(origin: string, path: string, signal: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(`${origin}${path}`, { cache: 'no-store', signal });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

function addEdge(edges: Array<{ from: string; to: string; relationship: Relationship; confidence: Confidence; evidence: string; source: string }>, edge: { from: string; to: string; relationship: Relationship; confidence: Confidence; evidence: string; source: string }) {
  if (!ADDRESS_RE.test(edge.from) || !ADDRESS_RE.test(edge.to)) return;
  const key = `${edge.from}:${edge.to}:${edge.relationship}`;
  if (!edges.some((candidate) => `${candidate.from}:${candidate.to}:${candidate.relationship}` === key)) edges.push(edge);
}

function rowsFrom(value: unknown): Json[] {
  if (!value || typeof value !== 'object') return [];
  const object = value as { rows?: Json[]; wallets?: Json[]; clusters?: Json[] };
  return object.rows ?? object.wallets ?? object.clusters ?? [];
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim() ?? '';
  if (!ADDRESS_RE.test(mint)) return Response.json({ status: 'error', error: 'Missing or invalid mint.', execution: 'read-only-wallet-graph-no-trading' }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const profile = searchParams.get('profile')?.trim() ?? 'live-read';
  const prototype = profile === 'prototype';
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '80') || 80, 1), prototype ? 40 : 120);
  const creatorParam = searchParams.get('creator')?.trim();
  const devWallets = parseWallets(searchParams.get('devWallets'));
  const qMint = encodeURIComponent(mint);
  const devParam = devWallets.length ? `&devWallets=${encodeURIComponent(devWallets.join(','))}` : '';

  try {
    const [stats, transactions, fresh, bundles, devSold, funding] = await Promise.all([
      readJson(origin, `/api/token-stats?mint=${qMint}&holderListLimit=${limit}${prototype ? '&profile=prototype' : '&fastHolders=1'}${devParam}`, controller.signal),
      prototype ? Promise.resolve(null) : readJson(origin, `/api/token-transactions?mint=${qMint}&limit=${limit}`, controller.signal),
      prototype ? Promise.resolve(null) : readJson(origin, `/api/fresh-wallet-classifier?mint=${qMint}&limit=${limit}`, controller.signal),
      prototype ? Promise.resolve(null) : readJson(origin, `/api/bundle-clustering-index?mint=${qMint}&limit=${limit}`, controller.signal),
      devWallets.length ? readJson(origin, `/api/dev-sold-classifier?mint=${qMint}${devParam}&limit=${limit}`, controller.signal) : Promise.resolve(null),
      devWallets.length ? readJson(origin, `/api/wallet-funding-index?wallets=${encodeURIComponent(devWallets.join(','))}&limit=${Math.min(limit, 40)}`, controller.signal) : Promise.resolve(null)
    ]);

    const rugcheck = objectValue(objectValue(stats?.rugcheck));
    const creator = ADDRESS_RE.test(creatorParam ?? '') ? creatorParam as string : typeof rugcheck.creator === 'string' && ADDRESS_RE.test(rugcheck.creator) ? rugcheck.creator : null;
    const seedWallets = Array.from(new Set([creator, ...devWallets].filter((wallet): wallet is string => Boolean(wallet))));
    const edges: Array<{ from: string; to: string; relationship: Relationship; confidence: Confidence; evidence: string; source: string }> = [];
    for (const seed of seedWallets) {
      addEdge(edges, { from: seed, to: seed, relationship: seed === creator ? 'creator' : 'configured-dev', confidence: seed === creator ? 'medium' : 'high', evidence: seed === creator ? 'Creator/deployer wallet from RugCheck or request parameter.' : 'Configured project/dev wallet from request parameter.', source: seed === creator ? 'rugcheck/request' : 'request' });
    }

    const devRows = rowsFrom(devSold);
    for (const row of devRows) {
      const wallet = String(row.wallet ?? row.address ?? '');
      if (seedWallets.includes(wallet)) {
        addEdge(edges, { from: wallet, to: wallet, relationship: 'direct-token-transfer', confidence: 'medium', evidence: 'Dev-sold classifier found token movement/holding evidence for configured dev wallet.', source: 'dev-sold-classifier' });
      }
    }

    const freshRows = rowsFrom(fresh);
    for (const row of freshRows) {
      const wallet = String(row.wallet ?? '');
      const fundingFrom = String(row.fundingFrom ?? row.funder ?? '');
      if (seedWallets.includes(fundingFrom) && ADDRESS_RE.test(wallet)) addEdge(edges, { from: fundingFrom, to: wallet, relationship: 'funded-by-seed', confidence: 'medium', evidence: 'Fresh wallet classifier linked buyer funding source to seed wallet.', source: 'fresh-wallet-classifier' });
      if (seedWallets.includes(wallet) && ADDRESS_RE.test(fundingFrom)) addEdge(edges, { from: fundingFrom, to: wallet, relationship: 'funded-seed', confidence: 'medium', evidence: 'Fresh wallet classifier found funding source for seed wallet.', source: 'fresh-wallet-classifier' });
    }

    const bundleRows = rowsFrom(bundles);
    for (const cluster of bundleRows) {
      const wallets = Array.isArray(cluster.wallets) ? cluster.wallets.map(String).filter((wallet) => ADDRESS_RE.test(wallet)) : [];
      const overlap = wallets.filter((wallet) => seedWallets.includes(wallet));
      if (overlap.length) {
        for (const wallet of wallets.slice(0, 20)) addEdge(edges, { from: overlap[0], to: wallet, relationship: 'bundle-overlap', confidence: 'low', evidence: 'Bundle clustering found wallet in same suspected bundle/slot cluster as seed wallet.', source: 'bundle-clustering-index' });
      }
    }

    const fundingRows = rowsFrom(funding);
    for (const row of fundingRows) {
      const wallet = String(row.wallet ?? row.address ?? '');
      const funder = String(row.fundingFrom ?? row.funder ?? row.sourceWallet ?? '');
      if (seedWallets.includes(wallet) && ADDRESS_RE.test(funder)) addEdge(edges, { from: funder, to: wallet, relationship: 'funded-seed', confidence: 'medium', evidence: 'Wallet funding index identified a funder for a seed wallet.', source: 'wallet-funding-index' });
    }

    const insiderNetworks = numberOrNull(objectValue(stats?.insiders).insiderNetworks ?? objectValue(stats?.insiders).networks ?? rugcheck.graphInsidersDetected);
    if (insiderNetworks !== null && creator) addEdge(edges, { from: creator, to: creator, relationship: 'rugcheck-network', confidence: insiderNetworks > 0 ? 'medium' : 'low', evidence: `RugCheck reports ${insiderNetworks} insider network signal(s).`, source: 'rugcheck' });

    const relatedWallets = Array.from(new Set(edges.flatMap((edge) => [edge.from, edge.to]).filter((wallet) => !seedWallets.includes(wallet))));
    const graphWallets = new Set([...seedWallets, ...relatedWallets]);
    const holders = objectValue(stats?.holders);
    const holderRows = Array.isArray(holders.rows) ? holders.rows as Json[] : [];
    let matchedAmount = 0;
    let currentHolderMatches = 0;
    for (const row of holderRows) {
      const owner = String(row.owner ?? '');
      if (graphWallets.has(owner)) {
        currentHolderMatches += 1;
        matchedAmount += numberOrNull(row.uiAmount) ?? 0;
      }
    }
    const supply = numberOrNull(objectValue(stats?.supply).uiAmount);
    const supplyPct = supply && supply > 0 ? Number(((matchedAmount / supply) * 100).toFixed(4)) : null;
    const holderRowsReturned = numberOrNull(holders.walletCountReturned ?? holders.returnedRows) ?? holderRows.length;
    const holderLimit = numberOrNull(holders.walletLimit ?? holders.requestedLimit ?? holders.listLimit) ?? limit;
    const isTruncated = Boolean(holders.isTruncated);
    const supplyPctCoverage = supplyPct === null
      ? holderRows.length ? 'summary-only' : 'unavailable'
      : isTruncated || holderRowsReturned < holderLimit ? 'partial-top-holder-overlap'
        : 'exact-for-holder-universe';
    const providersUsed = ['token-stats', ...(transactions ? ['token-transactions'] : []), ...(fresh ? ['fresh-wallet-classifier'] : []), ...(bundles ? ['bundle-clustering-index'] : []), ...(devSold ? ['dev-sold-classifier'] : []), ...(funding ? ['wallet-funding-index'] : [])];
    const missingProviders = [transactions ? null : 'token-transactions', fresh ? null : 'fresh-wallet-classifier', bundles ? null : 'bundle-clustering-index', devWallets.length && !funding ? 'wallet-funding-index' : null].filter((value): value is string => Boolean(value));
    const evidence = [
      seedWallets.length ? `${seedWallets.length} seed wallet(s) available.` : 'No seed wallets available.',
      edges.length ? `${edges.length} relationship edge(s) found.` : 'No relationship edges found from configured read-only sources.',
      `${currentHolderMatches} graph wallet(s) matched current holder rows.`,
      insiderNetworks !== null ? `RugCheck network signal count: ${insiderNetworks}.` : 'RugCheck insider network count unavailable.'
    ];
    const limitations = [
      supplyPctCoverage === 'partial-top-holder-overlap' ? 'Supply percentage is only top-holder overlap, not full holder-universe exact percentage.' : null,
      isTruncated ? 'Holder list is truncated by provider coverage.' : null,
      seedWallets.length ? null : 'Creator/dev seed wallets unavailable, so graph expansion is limited.',
      'Shared funding and direct transfer evidence depends on configured indexers and may miss CEX/private funding links.',
      'This route is read-only and does not infer hidden ownership beyond observable provider data.'
    ].filter((value): value is string => Boolean(value));
    const confidence: Confidence = supplyPct !== null && currentHolderMatches > 0 && edges.length > 2 && !isTruncated ? 'high' : edges.length || seedWallets.length || insiderNetworks !== null ? 'medium' : 'low';

    return Response.json({
      status: edges.length || seedWallets.length || holderRows.length ? 'ok' : 'limited',
      source: 'wallet-graph-insider-index',
      observedAt: new Date().toISOString(),
      mint,
      graph: { seedWallets, relatedWallets, edges },
      insider: { walletCount: graphWallets.size, currentHolderMatches, supplyPct, supplyPctCoverage, confidence, evidence, limitations },
      coverage: { holderRowsReturned, holderLimit, isTruncated, providersUsed, missingProviders },
      execution: 'read-only-wallet-graph-no-trading'
    });
  } catch (error) {
    return Response.json({ status: 'partial', source: 'wallet-graph-insider-index', observedAt: new Date().toISOString(), mint, graph: { seedWallets: [], relatedWallets: [], edges: [] }, insider: { walletCount: 0, currentHolderMatches: 0, supplyPct: null, supplyPctCoverage: 'unavailable', confidence: 'low', evidence: [], limitations: [error instanceof Error ? error.message : 'Wallet graph lookup timed out or failed.'] }, coverage: { holderRowsReturned: 0, holderLimit: limit, isTruncated: false, providersUsed: [], missingProviders: ['token-stats'] }, execution: 'read-only-wallet-graph-no-trading' }, { status: 200 });
  } finally {
    clearTimeout(timeout);
  }
}
