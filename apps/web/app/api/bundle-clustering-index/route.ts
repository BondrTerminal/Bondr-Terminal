import { Connection, PublicKey } from '@solana/web3.js';
import { configuredSolanaRpc, getHeliusApiKey } from '../../../lib/solana-rpc';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TIMEOUT_MS = 8_000;

type HeliusTx = { signature?: string; slot?: number; timestamp?: number; feePayer?: string; type?: string; source?: string; tokenTransfers?: Array<{ mint?: string; fromUserAccount?: string; toUserAccount?: string; tokenAmount?: number }> };

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' }, cache: 'no-store' }); }
  finally { clearTimeout(timeout); }
}

async function heliusRows(mint: string, limit: number) {
  const key = getHeliusApiKey();
  if (!key) return { source: 'helius', status: 'unavailable', note: 'HELIUS_API_KEY or Helius RPC api-key not configured.', rows: [] as HeliusTx[] };
  const response = await fetchWithTimeout(`https://api.helius.xyz/v0/addresses/${mint}/transactions?api-key=${encodeURIComponent(key)}&limit=${Math.min(Math.max(limit, 1), 100)}`);
  if (!response.ok) return { source: 'helius', status: 'unavailable', note: `Helius ${response.status} ${response.statusText}`, rows: [] as HeliusTx[] };
  const rows = await response.json() as HeliusTx[];
  return { source: 'helius', status: rows.length ? 'ok' : 'empty', note: null, rows };
}

async function rpcFallback(mint: string, limit: number) {
  const rpc = configuredSolanaRpc();
  const connection = new Connection(rpc.url, 'confirmed');
  const signatures = await connection.getSignaturesForAddress(new PublicKey(mint), { limit: Math.min(Math.max(limit, 1), 100) }, 'confirmed');
  return signatures.map((sig) => ({ signature: sig.signature, slot: sig.slot, timestamp: sig.blockTime ?? undefined, feePayer: undefined, type: 'signature', source: rpc.provider, tokenTransfers: [] }));
}

function cluster(rows: HeliusTx[], mint: string) {
  const buckets = new Map<string, HeliusTx[]>();
  for (const row of rows) {
    const slotKey = row.slot != null ? `slot:${row.slot}` : `time:${row.timestamp ?? 'unknown'}`;
    if (!buckets.has(slotKey)) buckets.set(slotKey, []);
    buckets.get(slotKey)!.push(row);
  }
  return Array.from(buckets.entries()).map(([key, bucket]) => {
    const wallets = new Set<string>();
    let tokenTransferAmount = 0;
    for (const tx of bucket) {
      if (tx.feePayer) wallets.add(tx.feePayer);
      for (const transfer of tx.tokenTransfers ?? []) {
      if (transfer.mint && transfer.mint !== mint) continue;
      if (transfer.fromUserAccount) wallets.add(transfer.fromUserAccount);
      if (transfer.toUserAccount) wallets.add(transfer.toUserAccount);
      tokenTransferAmount += transfer.tokenAmount ?? 0;
      }
    }
    return {
      key,
      slot: bucket[0]?.slot ?? null,
      timestamp: bucket[0]?.timestamp ? new Date(bucket[0].timestamp! * 1000).toISOString() : null,
      transactionCount: bucket.length,
      walletCount: wallets.size,
      tokenTransferAmount,
      signatures: bucket.map((tx) => tx.signature).filter(Boolean).slice(0, 20),
      suspectedBundle: bucket.length >= 3 || wallets.size >= 5
    };
  }).sort((a, b) => Number(b.suspectedBundle) - Number(a.suspectedBundle) || b.transactionCount - a.transactionCount);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get('mint')?.trim();
  const limit = Number(searchParams.get('limit') ?? '100');
  if (!mint || !ADDRESS_RE.test(mint)) return Response.json({ error: 'Missing or invalid mint.' }, { status: 400 });

  const helius = await heliusRows(mint, limit).catch((error) => ({ source: 'helius', status: 'unavailable', note: error instanceof Error ? error.message : 'Helius unavailable.', rows: [] as HeliusTx[] }));
  const rows = helius.rows.length ? helius.rows : await rpcFallback(mint, limit).catch(() => [] as HeliusTx[]);
  const clusters = cluster(rows, mint);
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    mint,
    source: helius.rows.length ? 'helius' : 'solana-rpc-signatures',
    providerStatus: helius.status,
    note: helius.rows.length ? 'Same-slot grouping from parsed Helius rows, fee payers, and token-transfer wallets.' : helius.note ?? 'RPC fallback has signatures/slots only. Configure HELIUS_API_KEY for wallet-level bundle clustering.',
    clusters,
    summary: { sampledTransactions: rows.length, suspectedClusters: clusters.filter((row) => row.suspectedBundle).length },
    execution: 'live-index-read'
  });
}
