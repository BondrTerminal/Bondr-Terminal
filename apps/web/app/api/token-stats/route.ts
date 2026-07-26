import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { configuredSolanaRpc, getHeliusApiKey } from '../../../lib/solana-rpc';
import { pumpfunFetch } from '../../../lib/indexers/pumpfun';

export const dynamic = 'force-dynamic';

const RPC_TIMEOUT_MS = 8_000;
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const RUGCHECK_TIMEOUT_MS = 6_000;

type ParsedTokenAccount = {
  data?: {
    parsed?: {
      info?: {
        owner?: string;
        tokenAmount?: { uiAmount?: number | null; uiAmountString?: string; amount?: string; decimals?: number };
      };
    };
  };
};

type RugCheckReport = {
  totalHolders?: number;
  creator?: string;
  creatorBalance?: number;
  topHolders?: Array<{ owner?: string; address?: string; amount?: number; pct?: number; percentage?: number; uiAmount?: number }> | null;
  graphInsidersDetected?: number;
  insiderNetworks?: unknown[] | Record<string, unknown> | null;
  risks?: Array<{ name?: string; description?: string; level?: string; score?: number }>;
  lockerScanStatus?: string;
  lockers?: Record<string, unknown> | null;
  totalLPProviders?: number;
  totalMarketLiquidity?: number;
  rugged?: boolean;
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  token?: { supply?: number; decimals?: number; mintAuthority?: string | null; freezeAuthority?: string | null };
};

type HolderAccountRow = {
  tokenAccount: string;
  owner: string | null;
  uiAmount: number;
  rawAmount: string;
  decimals: number | null;
  pct?: number | null;
  valueUsd?: number | null;
  rank?: number | null;
  ownerSolBalance?: number | null;
  ownerBalanceStatus?: string;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs = RPC_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('RPC request timed out.')), timeoutMs))
  ]);
}

function pct(value: number | null, total: number | null): number | null {
  if (value === null || total === null || total <= 0) return null;
  return Number(((value / total) * 100).toFixed(2));
}

function parseDevWallets(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(',').map((item) => item.trim()).filter((item) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(item));
}

async function getParsedOwner(connection: Connection, tokenAccount: string): Promise<string | null> {
  try {
    const account = await withTimeout(connection.getParsedAccountInfo(new PublicKey(tokenAccount), 'confirmed'));
    const value = account.value as unknown as ParsedTokenAccount | null;
    return value?.data?.parsed?.info?.owner ?? null;
  } catch {
    return null;
  }
}

async function getDevTokenBalance(connection: Connection, mint: PublicKey, owner: string): Promise<number> {
  try {
    const accounts = await withTimeout(connection.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint }, 'confirmed'));
    return accounts.value.reduce((sum, account) => {
      const parsed = account.account.data.parsed as { info?: { tokenAmount?: { uiAmount?: number | null } } };
      return sum + (parsed.info?.tokenAmount?.uiAmount ?? 0);
    }, 0);
  } catch {
    return 0;
  }
}



async function getSolscanHolderRows(mint: string, limit: number) {
  const key = process.env.SOLSCAN_API_KEY?.trim() || process.env.SOLSCAN_PRO_API_KEY?.trim();
  if (!key) return null;
  const pageSize = Math.min(Math.max(limit, 10), 40);
  const url = new URL('https://pro-api.solscan.io/v2.0/token/holders');
  url.searchParams.set('address', mint);
  url.searchParams.set('page', '1');
  url.searchParams.set('page_size', String(pageSize));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      cache: 'no-store',
      headers: { accept: 'application/json', token: key }
    });
    if (!response.ok) return null;
    const payload = await response.json() as { success?: boolean; total?: number; data?: { total?: number; items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> };
    const items = Array.isArray(payload.data) ? payload.data : payload.data?.items ?? payload.items ?? [];
    const rows = items.slice(0, limit).map((holder) => {
      const amount = Number(holder.amount ?? holder.uiAmount ?? 0) || 0;
      return {
        tokenAccount: String(holder.address ?? holder.tokenAccount ?? 'solscan-holder'),
        owner: String(holder.owner ?? '') || null,
        uiAmount: amount,
        rawAmount: String(holder.amount_str ?? holder.amount ?? amount),
        decimals: typeof holder.decimals === 'number' ? holder.decimals : null,
        pct: typeof holder.percentage === 'number' ? holder.percentage : null,
        valueUsd: typeof holder.value === 'number' ? holder.value : null,
        rank: typeof holder.rank === 'number' ? holder.rank : null
      };
    }).filter((row) => row.owner || row.uiAmount > 0);
    const uniqueOwners = new Set(rows.map((row) => row.owner).filter(Boolean));
    return rows.length ? { tokenAccountCount: Number(payload.total ?? (Array.isArray(payload.data) ? rows.length : payload.data?.total) ?? rows.length) || null, nonZeroTokenAccounts: rows.length, uniqueOwnerCount: uniqueOwners.size, rows } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getHeliusHolderTokenAccounts(mint: string, limit: number) {
  const key = getHeliusApiKey();
  if (!key) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'meridian-token-accounts',
        method: 'getTokenAccounts',
        params: { mint, page: 1, limit: Math.min(Math.max(limit, 1), 100), displayOptions: { showZeroBalance: false } }
      })
    });
    if (!response.ok) return null;
    const payload = await response.json() as { result?: { token_accounts?: Array<{ address?: string; owner?: string; amount?: number | string; rawAmount?: string; decimals?: number }> } };
    const rows = (payload.result?.token_accounts ?? []).map((account) => ({
      tokenAccount: account.address ?? 'helius-token-account',
      owner: account.owner ?? null,
      uiAmount: Number(account.amount ?? 0) || 0,
      rawAmount: account.rawAmount ?? String(account.amount ?? 0),
      decimals: account.decimals ?? null
    })).filter((row) => row.uiAmount > 0);
    const uniqueOwners = new Set(rows.map((row) => row.owner).filter(Boolean));
    return rows.length ? { tokenAccountCount: null as number | null, nonZeroTokenAccounts: rows.length, uniqueOwnerCount: uniqueOwners.size, rows } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getPumpfunHolderRows(mint: string, limit: number, supply: number | null) {
  const result = await pumpfunFetch<Array<Record<string, unknown>>>(`/coins/top-holders-and-sol-balance/${mint}`, { authRequired: false });
  const rows = (result.data ?? []).slice(0, limit).map((holder) => {
    const owner = String(holder.owner ?? holder.address ?? holder.user ?? holder.wallet ?? '') || null;
    const amount = Number(holder.amount ?? holder.uiAmount ?? holder.token_amount ?? holder.balance ?? 0) || 0;
    return {
      tokenAccount: String(holder.tokenAccount ?? holder.token_account ?? owner ?? 'pumpfun-holder'),
      owner,
      uiAmount: amount,
      rawAmount: String(holder.rawAmount ?? holder.raw_amount ?? amount),
      decimals: typeof holder.decimals === 'number' ? holder.decimals : null,
      pct: typeof holder.pct === 'number' ? holder.pct : typeof holder.percentage === 'number' ? holder.percentage : pct(amount, supply)
    };
  }).filter((row) => row.owner || row.uiAmount > 0);
  if (!rows.length) return { holderAccounts: null, result };
  const uniqueOwners = new Set(rows.map((row) => row.owner).filter(Boolean));
  return { holderAccounts: { tokenAccountCount: null as number | null, nonZeroTokenAccounts: rows.length, uniqueOwnerCount: uniqueOwners.size, rows }, result };
}

async function getHolderTokenAccounts(connection: Connection, mint: PublicKey, limit: number) {
  const accounts = await withTimeout(connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint.toBase58() } }],
    commitment: 'confirmed'
  }), 12_000);
  const rows = accounts.map((account) => {
    const parsed = account.account.data as unknown as { parsed?: { info?: { owner?: string; tokenAmount?: { uiAmount?: number | null; uiAmountString?: string; amount?: string; decimals?: number } } } };
    const info = parsed.parsed?.info;
    const uiAmount = info?.tokenAmount?.uiAmount ?? Number(info?.tokenAmount?.uiAmountString ?? 0);
    return {
      tokenAccount: account.pubkey.toBase58(),
      owner: info?.owner ?? null,
      uiAmount: Number.isFinite(uiAmount) ? uiAmount : 0,
      rawAmount: info?.tokenAmount?.amount ?? '0',
      decimals: info?.tokenAmount?.decimals ?? null
    };
  }).filter((row) => row.uiAmount > 0).sort((a, b) => b.uiAmount - a.uiAmount);
  const uniqueOwners = new Set(rows.map((row) => row.owner).filter(Boolean));
  return { tokenAccountCount: accounts.length, nonZeroTokenAccounts: rows.length, uniqueOwnerCount: uniqueOwners.size, rows: rows.slice(0, limit) };
}

async function getLargestHolderTokenAccounts(connection: Connection, largest: Array<{ tokenAccount: string; amount: number; decimals: number }>, limit: number) {
  const rows = await Promise.all(largest.slice(0, limit).map(async (account) => ({
    tokenAccount: account.tokenAccount,
    owner: await getParsedOwner(connection, account.tokenAccount),
    uiAmount: account.amount,
    rawAmount: String(account.amount),
    decimals: account.decimals
  })));
  const uniqueOwners = new Set(rows.map((row) => row.owner).filter(Boolean));
  return { tokenAccountCount: null as number | null, nonZeroTokenAccounts: rows.length, uniqueOwnerCount: uniqueOwners.size, rows };
}

async function enrichHolderOwnerBalances(connection: Connection, rows: HolderAccountRow[], warnings: string[]) {
  const owners = Array.from(new Set(rows.map((row) => row.owner).filter((owner): owner is string => Boolean(owner))));
  if (!owners.length) return rows;
  try {
    const publicKeys = owners.map((owner) => new PublicKey(owner));
    const accounts = await withTimeout(connection.getMultipleAccountsInfo(publicKeys, 'confirmed'), 8_000);
    const balances = new Map<string, number | null>();
    owners.forEach((owner, index) => balances.set(owner, accounts[index] ? accounts[index]!.lamports / LAMPORTS_PER_SOL : null));
    return rows.map((row) => ({
      ...row,
      ownerSolBalance: row.owner ? balances.get(row.owner) ?? null : null,
      ownerBalanceStatus: row.owner ? 'solana-rpc-getMultipleAccountsInfo' : 'missing-owner'
    }));
  } catch (error) {
    warnings.push(`Holder owner SOL balance lookup unavailable: ${error instanceof Error ? error.message : 'RPC failed'}`);
    return rows.map((row) => ({ ...row, ownerSolBalance: null, ownerBalanceStatus: row.owner ? 'unavailable' : 'missing-owner' }));
  }
}

async function fetchRugCheck(mint: string): Promise<RugCheckReport | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RUGCHECK_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'MeridianTerminal/0.1' },
      next: { revalidate: 20 }
    });
    if (!response.ok) return null;
    return await response.json() as RugCheckReport;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}


function rugHolderRows(report: RugCheckReport | null, limit: number, supply: number | null) {
  return (report?.topHolders ?? []).slice(0, limit).map((holder) => {
    const uiAmount = holder.uiAmount ?? holder.amount ?? 0;
    return {
      tokenAccount: holder.address ?? holder.owner ?? 'rugcheck-holder',
      owner: holder.owner ?? holder.address ?? null,
      uiAmount,
      rawAmount: String(uiAmount),
      decimals: null,
      pct: holder.pct ?? holder.percentage ?? pct(uiAmount, supply)
    };
  }).filter((row) => row.owner || row.uiAmount > 0);
}

function rugTop10Pct(report: RugCheckReport | null, supply: number | null): number | null {
  const holders = report?.topHolders;
  if (!holders?.length) return null;
  const explicit = holders.slice(0, 10).map((holder) => holder.pct ?? holder.percentage).filter((value): value is number => typeof value === 'number');
  if (explicit.length) return Number(explicit.reduce((sum, value) => sum + value, 0).toFixed(2));
  if (!supply) return null;
  const amount = holders.slice(0, 10).reduce((sum, holder) => sum + (holder.uiAmount ?? holder.amount ?? 0), 0);
  return pct(amount, supply);
}

function countInsiderNetworks(report: RugCheckReport | null): number | null {
  const networks = report?.insiderNetworks;
  if (Array.isArray(networks)) return networks.length;
  if (networks && typeof networks === 'object') return Object.keys(networks).length;
  if (typeof report?.graphInsidersDetected === 'number') return report.graphInsidersDetected;
  return null;
}

function unavailableResponse(mint: string, reason: string, configured: boolean) {
  return Response.json({
    mint,
    source: 'solana-rpc',
    rpcConfigured: configured,
    status: 'partial-unavailable',
    warning: reason,
    supply: null,
    holders: { tokenAccountCount: null, nonZeroTokenAccounts: null, uniqueOwnerCount: null, totalHolders: null, rows: [], source: 'unavailable', status: 'unavailable', note: reason },
    concentration: { top10Amount: null, top10Pct: null, largestOwners: [] },
    devHolding: { devWallets: [], amount: null, pct: null, status: 'unavailable', note: reason },
    snipers: { pct: null, status: 'launch-parser-pending', note: 'Read-data providers are Helius/RPC-aware; launch-window parser still needs first buyers, funding source, hold/sell state.' },
    bundlers: { pct: null, status: 'bitquery-or-helius-required', note: 'Requires same-slot/same-block transaction clustering and bundle signature grouping.' },
    insiders: { pct: null, status: 'wallet-graph-parser-pending', note: 'Requires wallet graph parser: deployer/team funding links, token transfers, shared authorities.' },
    lpBurned: { pct: null, status: 'pool-lp-scan-required', note: 'Requires pool LP mint/lock/burn inspection for the active DEX pair.' },
    execution: 'read-only'
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prototype = searchParams.get('profile') === 'prototype' || searchParams.get('prototype') === '1';
  const mintParam = searchParams.get('mint')?.trim();
  const devWallets = parseDevWallets(searchParams.get('devWallets'));
  const holderListLimit = Math.min(Math.max(Number(searchParams.get('holderListLimit') ?? '100'), 1), prototype ? 20 : 250);

  if (!mintParam) return Response.json({ error: 'Missing mint query parameter.' }, { status: 400 });
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mintParam)) return Response.json({ error: 'Invalid Solana mint/address shape.' }, { status: 400 });

  const rpc = configuredSolanaRpc();
  const rpcUrl = rpc.url;
  const rpcConfigured = rpc.configured;
  const connection = new Connection(rpcUrl, 'confirmed');

  try {
    const mint = new PublicKey(mintParam);
    const warnings: string[] = [];
    const rugcheck = await fetchRugCheck(mintParam);
    const supplyResult = prototype ? null : await withTimeout(connection.getTokenSupply(mint, 'confirmed')).catch((error) => {
      warnings.push(`Supply lookup unavailable: ${error instanceof Error ? error.message : 'RPC failed'}`);
      return null;
    });

    const fallbackDecimals = rugcheck?.token?.decimals ?? 0;
    const supply = supplyResult?.value.uiAmount ?? (typeof rugcheck?.token?.supply === 'number' ? rugcheck.token.supply : null);
    const supplyDecimals = supplyResult?.value.decimals ?? fallbackDecimals;
    const supplyRaw = supplyResult?.value.amount ?? (typeof rugcheck?.token?.supply === 'number' ? String(rugcheck.token.supply) : null);
    const largestAccounts = prototype ? null : await withTimeout(connection.getTokenLargestAccounts(mint, 'confirmed')).catch((error) => {
      warnings.push(`Largest holder lookup unavailable: ${error instanceof Error ? error.message : 'RPC failed'}`);
      return null;
    });
    const largest = (largestAccounts?.value ?? []).map((account) => ({
        tokenAccount: account.address.toBase58(),
        amount: account.uiAmount ?? Number(account.amount) / (10 ** supplyDecimals),
        decimals: supplyDecimals
      }));
    const top10Amount = largest.slice(0, 10).reduce((sum, account) => sum + account.amount, 0);
    const top20WithOwners = prototype
      ? largest.slice(0, 20).map((account) => ({ ...account, owner: null, pct: pct(account.amount, supply), ownerStatus: 'prototype-skip' }))
      : await Promise.all(largest.slice(0, 20).map(async (account) => ({
        ...account,
        owner: await getParsedOwner(connection, account.tokenAccount),
        pct: pct(account.amount, supply),
        ownerStatus: 'solana-rpc-getParsedAccountInfo'
      })));

    const devBalances = await Promise.all(devWallets.map(async (wallet) => {
      try {
        return { wallet, amount: await getDevTokenBalance(connection, mint, wallet) };
      } catch (error) {
        warnings.push(`Dev wallet balance unavailable for ${wallet}: ${error instanceof Error ? error.message : 'RPC failed'}`);
        return { wallet, amount: 0 };
      }
    }));
    const devAmount = devBalances.reduce((sum, row) => sum + row.amount, 0);

    let holderSource = 'unavailable';
    const prototypeRugRows = prototype ? rugHolderRows(rugcheck, holderListLimit, supply) : [];
    let holderAccounts: (Omit<Awaited<ReturnType<typeof getHolderTokenAccounts>>, 'tokenAccountCount'> & { tokenAccountCount: number | null }) | null = prototypeRugRows.length ? { tokenAccountCount: null, nonZeroTokenAccounts: prototypeRugRows.length, uniqueOwnerCount: new Set(prototypeRugRows.map((row) => row.owner).filter(Boolean)).size, rows: prototypeRugRows } : await getSolscanHolderRows(mint.toBase58(), holderListLimit);
    if (holderAccounts?.rows?.length) holderSource = prototypeRugRows.length ? 'rugcheck-top-holders' : 'solscan-pro-token-holders';

    if (!holderAccounts?.rows?.length) {
      holderAccounts = await getHeliusHolderTokenAccounts(mint.toBase58(), holderListLimit);
      if (holderAccounts?.rows?.length) holderSource = 'helius-das-getTokenAccounts';
    }

    if (!holderAccounts?.rows?.length) {
      holderAccounts = await getLargestHolderTokenAccounts(connection, largest, holderListLimit).catch((error) => {
        warnings.push(`Largest holder owner lookup unavailable: ${error instanceof Error ? error.message : 'RPC failed'}`);
        return null;
      });
      if (holderAccounts?.rows?.length) holderSource = 'solana-rpc-getTokenLargestAccounts';
    }

    if (!holderAccounts?.rows?.length) {
      const pump = await getPumpfunHolderRows(mint.toBase58(), holderListLimit, supply).catch(() => ({ holderAccounts: null, result: null }));
      if (pump.holderAccounts?.rows?.length) {
        holderAccounts = pump.holderAccounts;
        holderSource = 'pumpfun-top-holders';
      }
    }

    if (!holderAccounts?.rows?.length) {
      const rugRows = rugHolderRows(rugcheck, holderListLimit, supply);
      if (rugRows.length) {
        holderAccounts = { tokenAccountCount: null, nonZeroTokenAccounts: rugRows.length, uniqueOwnerCount: new Set(rugRows.map((row) => row.owner).filter(Boolean)).size, rows: rugRows };
        holderSource = 'rugcheck-top-holders';
      }
    }
    let tokenAccountCount: number | null = holderAccounts?.tokenAccountCount ?? null;
    let holderCountStatus: 'ok' | 'unavailable' = holderAccounts?.rows?.length ? 'ok' : 'unavailable';

    if (searchParams.get('fullHolders') === '1') {
      try {
        const fullHolderAccounts = await getHolderTokenAccounts(connection, mint, holderListLimit);
        holderAccounts = fullHolderAccounts;
        tokenAccountCount = fullHolderAccounts.tokenAccountCount;
        holderCountStatus = 'ok';
      } catch (error) {
        warnings.push(`Full RPC token-account holder scan unavailable: ${error instanceof Error ? error.message : 'RPC failed'}`);
      }
    }

    const rawHolderRows = (holderAccounts?.rows ?? []) as HolderAccountRow[];
    const rankedHolderRows = rawHolderRows.map((row, index) => ({
      ...row,
      rank: typeof row.rank === 'number' ? row.rank : index + 1,
      pct: typeof row.pct === 'number' ? row.pct : pct(row.uiAmount, supply)
    }));
    const holderRows = prototype
      ? rankedHolderRows.map((row) => ({ ...row, ownerSolBalance: null, ownerBalanceStatus: row.owner ? 'prototype-skip' : 'missing-owner' }))
      : await enrichHolderOwnerBalances(connection, rankedHolderRows, warnings);

    return Response.json({
      mint: mint.toBase58(),
      source: 'solana-rpc',
      rpcProvider: rpc.provider,
      rpcConfigured,
      status: warnings.length ? 'partial' : 'ok',
      warning: warnings.join(' | ') || null,
      supply: {
        uiAmount: supply,
        decimals: supplyDecimals,
        raw: supplyRaw,
        status: supplyResult ? 'ok' : 'degraded',
        note: supplyResult ? null : 'RPC supply lookup unavailable; holder table continues with Solscan/Helius/RPC/Pump.fun/RugCheck fallback rows.'
      },
      holders: {
        tokenAccountCount,
        nonZeroTokenAccounts: holderAccounts?.nonZeroTokenAccounts ?? null,
        uniqueOwnerCount: holderAccounts?.uniqueOwnerCount ?? null,
        totalHolders: holderAccounts?.uniqueOwnerCount ?? (typeof rugcheck?.totalHolders === 'number' ? rugcheck.totalHolders : null),
        listLimit: holderListLimit,
        rows: holderRows,
        status: holderAccounts?.rows?.length ? 'ok' : typeof rugcheck?.totalHolders === 'number' ? 'summary-only' : 'limited',
        source: holderAccounts?.rows?.length ? (searchParams.get('fullHolders') === '1' && tokenAccountCount != null ? 'solana-rpc-getParsedProgramAccounts' : holderSource) : 'rugcheck-summary',
        note: holderAccounts?.rows?.length ? (prototype ? `Top holder rows loaded from ${holderSource}; owner SOL balance enrichment skipped in prototype mode.` : searchParams.get('fullHolders') === '1' && tokenAccountCount != null ? 'Token holder accounts loaded through full Solana RPC token program account scan; owner SOL balances enriched through RPC.' : `Top holder rows loaded from ${holderSource}; owner SOL balances enriched through RPC when owners are known.`)  : typeof rugcheck?.totalHolders === 'number' ? 'Total holders from RugCheck report; RPC holder account list unavailable.' : 'RPC/RugCheck did not return exact holders.'
      },
      concentration: {
        top10Amount,
        top10Pct: supply && largest.length ? pct(top10Amount, supply) : rugTop10Pct(rugcheck, supply),
        largestOwners: top20WithOwners
      },
      devHolding: {
        devWallets,
        amount: devAmount,
        pct: pct(devAmount, supply),
        status: devWallets.length ? 'ok' : 'missing-dev-wallets',
        note: devWallets.length ? 'Computed by reading token accounts owned by configured project/dev wallets.' : 'Pass project/dev wallet addresses to compute dev holding.'
      },
      snipers: {
        pct: null,
        status: process.env.BIRDEYE_API_KEY || rpc.enhancedTransactions ? 'indexer-configured-parser-pending' : 'helius-or-birdeye-required',
        note: 'Read-data providers are Helius/RPC-aware; launch-window parser still needs first buyers, funding source, hold/sell state.'
      },
      bundlers: {
        pct: null,
        status: process.env.BITQUERY_API_KEY || rpc.enhancedTransactions ? 'indexer-configured-parser-pending' : 'bitquery-or-helius-required',
        note: 'Requires same-slot/same-block transaction clustering and bundle signature grouping.'
      },
      insiders: {
        pct: null,
        networks: countInsiderNetworks(rugcheck),
        status: rugcheck ? 'rugcheck' : 'wallet-graph-parser-pending',
        note: rugcheck ? 'RugCheck insider network count available; exact insider percentage needs our wallet-graph parser/indexer.' : 'Requires wallet graph parser: deployer/team funding links, token transfers, shared authorities.'
      },
      lpBurned: {
        pct: null,
        lockerScanStatus: rugcheck?.lockerScanStatus ?? null,
        totalLPProviders: rugcheck?.totalLPProviders ?? null,
        status: rugcheck ? 'rugcheck' : 'pool-lp-scan-required',
        note: rugcheck ? 'RugCheck locker/LP scan status available; exact LP burned percentage requires pool LP mint analysis.' : 'Requires pool LP mint/lock/burn inspection for the active DEX pair.'
      },
      rugcheck: rugcheck ? {
        status: 'ok',
        creator: rugcheck.creator ?? null,
        creatorBalance: rugcheck.creatorBalance ?? null,
        graphInsidersDetected: rugcheck.graphInsidersDetected ?? null,
        risks: rugcheck.risks ?? [],
        lockerScanStatus: rugcheck.lockerScanStatus ?? null,
        totalHolders: rugcheck.totalHolders ?? null,
        rugged: rugcheck.rugged ?? null,
        mintAuthority: rugcheck.mintAuthority ?? rugcheck.token?.mintAuthority ?? null,
        freezeAuthority: rugcheck.freezeAuthority ?? rugcheck.token?.freezeAuthority ?? null
      } : { status: 'unavailable' },
      execution: 'read-only'
    });
  } catch (error) {
    return unavailableResponse(mintParam, error instanceof Error ? error.message : 'Token stats lookup failed.', rpcConfigured);
  }
}
