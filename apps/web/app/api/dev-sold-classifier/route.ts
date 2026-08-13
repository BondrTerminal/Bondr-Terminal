import { getMeridianWalletStore } from '../../../lib/durable-wallet-store';
import { getHeliusApiKey } from '../../../lib/solana-rpc';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TIMEOUT_MS = 8_000;

type HeliusTx = { signature?: string; timestamp?: number; feePayer?: string; type?: string; tokenTransfers?: Array<{ mint?: string; fromUserAccount?: string; toUserAccount?: string; tokenAmount?: number }> };

function parseWallets(raw: string | null): string[] { return (raw ?? '').split(',').map((x) => x.trim()).filter((x) => ADDRESS_RE.test(x)); }
async function fetchWithTimeout(url: string): Promise<Response> { const c = new AbortController(); const t = setTimeout(() => c.abort(), TIMEOUT_MS); try { return await fetch(url, { signal: c.signal, headers: { accept: 'application/json' }, cache: 'no-store' }); } finally { clearTimeout(t); } }

async function heliusWalletRows(wallet: string, limit: number) {
  const key = getHeliusApiKey();
  if (!key) return { status: 'unavailable', note: 'HELIUS_API_KEY or Helius RPC api-key not configured.', rows: [] as HeliusTx[] };
  const response = await fetchWithTimeout(`https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${encodeURIComponent(key)}&limit=${Math.min(Math.max(limit, 1), 100)}`);
  if (!response.ok) return { status: 'unavailable', note: `Helius ${response.status} ${response.statusText}`, rows: [] as HeliusTx[] };
  const rows = await response.json() as HeliusTx[];
  return { status: 'ok', note: null, rows };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim();
  const group = searchParams.get('group')?.trim();
  const limit = Number(searchParams.get('limit') ?? '100');
  if (!mint || !ADDRESS_RE.test(mint)) return Response.json({ error: 'Missing or invalid mint.' }, { status: 400 });
  const explicit = parseWallets(searchParams.get('devWallets'));
  const store = await getMeridianWalletStore();
  const stored = store.wallets.filter((wallet) => !group || wallet.groupId === group).map((wallet) => wallet.address);
  const devWallets = Array.from(new Set(explicit.length ? explicit : stored)).slice(0, 25);

  const rows = await Promise.all(devWallets.map(async (wallet) => {
    const history = await heliusWalletRows(wallet, limit).catch((error) => ({ status: 'unavailable', note: error instanceof Error ? error.message : 'Helius unavailable.', rows: [] as HeliusTx[] }));
    const outgoing = history.rows.flatMap((tx) => (tx.tokenTransfers ?? [])
      .filter((transfer) => transfer.mint === mint && transfer.fromUserAccount === wallet && transfer.toUserAccount !== wallet)
      .map((transfer) => ({ signature: tx.signature ?? null, timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : null, to: transfer.toUserAccount ?? null, amount: transfer.tokenAmount ?? 0, type: tx.type ?? null })));
    const incoming = history.rows.flatMap((tx) => (tx.tokenTransfers ?? [])
      .filter((transfer) => transfer.mint === mint && transfer.toUserAccount === wallet && transfer.fromUserAccount !== wallet)
      .map((transfer) => ({ signature: tx.signature ?? null, timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : null, from: transfer.fromUserAccount ?? null, amount: transfer.tokenAmount ?? 0, type: tx.type ?? null })));
    return { wallet, providerStatus: history.status, providerNote: history.note, incomingAmount: incoming.reduce((s, x) => s + x.amount, 0), outgoingAmount: outgoing.reduce((s, x) => s + x.amount, 0), incomingCount: incoming.length, outgoingCount: outgoing.length, soldLikely: outgoing.length > 0, outgoing: outgoing.slice(0, 20), incoming: incoming.slice(0, 20) };
  }));

  return Response.json({ status: 'ok', observedAt: new Date().toISOString(), mint, walletCount: rows.length, source: getHeliusApiKey() ? 'helius' : 'missing-helius', summary: { walletsWithOutgoingTransfers: rows.filter((row) => row.soldLikely).length, totalOutgoingAmount: rows.reduce((sum, row) => sum + row.outgoingAmount, 0), totalIncomingAmount: rows.reduce((sum, row) => sum + row.incomingAmount, 0) }, wallets: rows, execution: 'live-index-read' });
}
