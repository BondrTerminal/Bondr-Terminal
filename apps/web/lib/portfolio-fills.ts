import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type MeridianStore } from './meridian-store';
import { getMeridianWalletStore } from './durable-wallet-store';
import { getHeliusApiKey } from './solana-rpc';
import type { WalletTradeFill } from './realized-pnl';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const CACHE_PATH = process.env.VERCEL
  ? join('/tmp', 'portfolio-fills-cache.json')
  : join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'portfolio-fills-cache.json');
const CACHE_TTL_MS = Number(process.env.PORTFOLIO_FILLS_CACHE_TTL_MS ?? '300000');
const TIMEOUT_MS = 8_000;
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type HeliusTransfer = { mint?: string; tokenAmount?: number; fromUserAccount?: string; toUserAccount?: string };
type HeliusNativeTransfer = { fromUserAccount?: string; toUserAccount?: string; amount?: number };
type HeliusTx = { signature?: string; timestamp?: number; tokenTransfers?: HeliusTransfer[]; nativeTransfers?: HeliusNativeTransfer[]; source?: string; type?: string };
type ProjectMint = { mint: string; projectId: string };
type CacheEntry = { observedAt: string; wallet: string; limit: number; fills: WalletTradeFill[]; note?: string | null };
type CacheFile = { contract: 'portfolio-fills-cache-v1'; rows: CacheEntry[] };

export type PortfolioFillsResult = {
  contract: 'portfolio-fills-v1';
  status: 'ok' | 'partial' | 'not-configured' | 'unavailable';
  observedAt: string;
  source: 'helius-wallet-history';
  confidence: 'provider-backed' | 'unavailable';
  walletCount: number;
  fillCount: number;
  cache: { hitCount: number; missCount: number; ttlMs: number };
  fills: WalletTradeFill[];
  gaps: string[];
  execution: 'live-index-read';
};

function readCache(): CacheFile {
  if (!existsSync(CACHE_PATH)) return { contract: 'portfolio-fills-cache-v1', rows: [] };
  try { return JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as CacheFile; }
  catch { return { contract: 'portfolio-fills-cache-v1', rows: [] }; }
}

function writeCache(cache: CacheFile) {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    const tmp = `${CACHE_PATH}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(cache, null, 2)}\n`);
    renameSync(tmp, CACHE_PATH);
  } catch {
    // Cache writes are opportunistic. Vercel/serverless filesystems can be read-only
    // outside /tmp; fill ingestion must still return structured JSON without cache.
  }
}

function fresh(entry: CacheEntry) {
  return Date.now() - new Date(entry.observedAt).getTime() <= CACHE_TTL_MS;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fetch(url, { signal: controller.signal, cache: 'no-store', headers: { accept: 'application/json' } }); }
  finally { clearTimeout(timeout); }
}

function dayKey(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp.slice(0, 10) : date.toISOString().slice(0, 10);
}

async function fetchSolUsdByDay(timestamps: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const times = timestamps.map((timestamp) => new Date(timestamp).getTime()).filter(Number.isFinite);
  if (!times.length) return map;
  const from = Math.floor((Math.min(...times) - 24 * 60 * 60 * 1000) / 1000);
  const to = Math.floor((Math.max(...times) + 24 * 60 * 60 * 1000) / 1000);
  try {
    const response = await fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/solana/market_chart/range?vs_currency=usd&from=${from}&to=${to}`);
    if (!response.ok) return map;
    const payload = await response.json() as { prices?: Array<[number, number]> };
    for (const [ms, price] of payload.prices ?? []) if (Number.isFinite(ms) && Number.isFinite(price)) map.set(new Date(ms).toISOString().slice(0, 10), price);
  } catch {
    return map;
  }
  return map;
}

function tokenAmountForWallet(tx: HeliusTx, wallet: string, mint: string) {
  let incoming = 0;
  let outgoing = 0;
  for (const transfer of tx.tokenTransfers ?? []) {
    if (transfer.mint !== mint) continue;
    const amount = Number(transfer.tokenAmount ?? 0) || 0;
    if (amount <= 0) continue;
    if (transfer.toUserAccount === wallet) incoming += amount;
    if (transfer.fromUserAccount === wallet) outgoing += amount;
  }
  return { incoming, outgoing, net: incoming - outgoing };
}

function quoteSolForWallet(tx: HeliusTx, wallet: string) {
  let incoming = 0;
  let outgoing = 0;
  for (const transfer of tx.nativeTransfers ?? []) {
    const amountSol = (Number(transfer.amount ?? 0) || 0) / 1_000_000_000;
    if (amountSol <= 0) continue;
    if (transfer.toUserAccount === wallet) incoming += amountSol;
    if (transfer.fromUserAccount === wallet) outgoing += amountSol;
  }
  for (const transfer of tx.tokenTransfers ?? []) {
    if (transfer.mint !== SOL_MINT) continue;
    const amount = Number(transfer.tokenAmount ?? 0) || 0;
    if (amount <= 0) continue;
    if (transfer.toUserAccount === wallet) incoming += amount;
    if (transfer.fromUserAccount === wallet) outgoing += amount;
  }
  return { incoming, outgoing };
}

export async function normalizeHeliusTransactions(args: { wallet: string; transactions: HeliusTx[]; projectMints: ProjectMint[] }): Promise<WalletTradeFill[]> {
  const timestamps = args.transactions.map((tx) => tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : null).filter((item): item is string => Boolean(item));
  const solUsd = await fetchSolUsdByDay(timestamps);
  const fills: WalletTradeFill[] = [];
  for (const tx of args.transactions) {
    const timestamp = tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : null;
    if (!timestamp || !tx.signature) continue;
    const quote = quoteSolForWallet(tx, args.wallet);
    for (const project of args.projectMints) {
      const token = tokenAmountForWallet(tx, args.wallet, project.mint);
      if (Math.abs(token.net) <= 0) continue;
      const side = token.net > 0 ? 'buy' : 'sell';
      const quoteAmountSol = side === 'buy' ? quote.outgoing : quote.incoming;
      if (quoteAmountSol <= 0) continue;
      fills.push({
        id: tx.signature,
        wallet: args.wallet,
        projectId: project.projectId,
        mint: project.mint,
        timestamp,
        side,
        tokenAmount: Math.abs(token.net),
        quoteAmountSol,
        priceUsd: solUsd.get(dayKey(timestamp)) ?? null,
        source: `helius-wallet-history:${tx.source ?? tx.type ?? 'transaction'}`,
        confidence: 'provider-backed'
      });
    }
  }
  return fills;
}

async function fetchHeliusFills(wallet: string, projectMints: ProjectMint[], limit: number): Promise<CacheEntry> {
  const key = getHeliusApiKey();
  if (!key) return { observedAt: new Date().toISOString(), wallet, limit, fills: [], note: 'HELIUS_API_KEY or Helius RPC api-key not configured.' };
  const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${encodeURIComponent(key)}&limit=${Math.min(Math.max(limit, 1), 100)}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) return { observedAt: new Date().toISOString(), wallet, limit, fills: [], note: `Helius ${response.status} ${response.statusText}` };
  const txs = await response.json() as HeliusTx[];
  const fills = await normalizeHeliusTransactions({ wallet, transactions: txs, projectMints });
  return { observedAt: new Date().toISOString(), wallet, limit, fills, note: fills.length ? null : 'Helius returned transactions but no SOL-quoted project token fills in sampled history.' };
}

export async function buildPortfolioFills(args: { wallet?: string | null; group?: string | null; limit?: number } = {}, storeOverride?: MeridianStore): Promise<PortfolioFillsResult> {
  const observedAt = new Date().toISOString();
  const store = storeOverride ?? await getMeridianWalletStore();
  const projectMints = store.projects.filter((project) => project.tokenMint).map((project) => ({ projectId: project.id, mint: project.tokenMint! }));
  const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 100);
  const wallets = (args.wallet ? [args.wallet] : store.wallets.filter((wallet) => !wallet.archived && (!args.group || wallet.groupId === args.group)).map((wallet) => wallet.address))
    .filter((wallet) => ADDRESS_RE.test(wallet))
    .slice(0, 25);
  const gaps: string[] = [];
  if (!projectMints.length) gaps.push('No project token mints available for wallet fill matching.');
  if (!wallets.length) gaps.push('No valid Meridian wallets available for fill ingestion.');
  if (!getHeliusApiKey()) gaps.push('HELIUS_API_KEY or Helius RPC api-key not configured; provider-backed fills unavailable.');
  if (!projectMints.length || !wallets.length || !getHeliusApiKey()) {
    return { contract: 'portfolio-fills-v1', status: getHeliusApiKey() ? 'unavailable' : 'not-configured', observedAt, source: 'helius-wallet-history', confidence: 'unavailable', walletCount: wallets.length, fillCount: 0, cache: { hitCount: 0, missCount: 0, ttlMs: CACHE_TTL_MS }, fills: [], gaps, execution: 'live-index-read' };
  }

  const cache = readCache();
  let hitCount = 0;
  let missCount = 0;
  const entries: CacheEntry[] = [];
  for (const wallet of wallets) {
    const cached = cache.rows.find((row) => row.wallet === wallet && row.limit === limit && fresh(row));
    if (cached) { hitCount += 1; entries.push(cached); continue; }
    missCount += 1;
    const entry = await fetchHeliusFills(wallet, projectMints, limit).catch((error) => ({ observedAt: new Date().toISOString(), wallet, limit, fills: [], note: error instanceof Error ? error.message : 'Helius fill fetch failed.' }));
    entries.push(entry);
    cache.rows = [entry, ...cache.rows.filter((row) => !(row.wallet === wallet && row.limit === limit))].slice(0, 200);
  }
  if (missCount) writeCache(cache);
  for (const entry of entries) if (entry.note) gaps.push(`${entry.wallet}: ${entry.note}`);
  const fills = entries.flatMap((entry) => entry.fills).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { contract: 'portfolio-fills-v1', status: fills.length ? (gaps.length ? 'partial' : 'ok') : 'unavailable', observedAt, source: 'helius-wallet-history', confidence: fills.length ? 'provider-backed' : 'unavailable', walletCount: wallets.length, fillCount: fills.length, cache: { hitCount, missCount, ttlMs: CACHE_TTL_MS }, fills, gaps, execution: 'live-index-read' };
}
