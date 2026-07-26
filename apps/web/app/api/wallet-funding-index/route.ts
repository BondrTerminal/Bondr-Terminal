import { Connection, PublicKey } from '@solana/web3.js';
import { getMeridianStore } from '../../../lib/meridian-store';
import { getHeliusApiKey, configuredSolanaRpc } from '../../../lib/solana-rpc';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TIMEOUT_MS = 8_000;

type HeliusTx = {
  signature?: string;
  timestamp?: number;
  type?: string;
  source?: string;
  feePayer?: string;
  nativeTransfers?: Array<{ fromUserAccount?: string; toUserAccount?: string; amount?: number }>;
};

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
  } finally {
    clearTimeout(timeout);
  }
}

async function heliusHistory(address: string, limit: number) {
  const key = getHeliusApiKey();
  if (!key) return { status: 'unavailable', note: 'HELIUS_API_KEY or Helius RPC api-key not configured.', rows: [] as unknown[] };
  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${encodeURIComponent(key)}&limit=${Math.min(Math.max(limit, 1), 100)}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) return { status: 'unavailable', note: `Helius ${response.status} ${response.statusText}`, rows: [] as unknown[] };
  const txs = await response.json() as HeliusTx[];
  const inbound = txs.flatMap((tx) => (tx.nativeTransfers ?? [])
    .filter((transfer) => transfer.toUserAccount === address)
    .map((transfer) => ({
      signature: tx.signature ?? null,
      timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : null,
      source: tx.source ?? null,
      type: tx.type ?? null,
      from: transfer.fromUserAccount ?? null,
      amountSol: (transfer.amount ?? 0) / 1_000_000_000,
      feePayer: tx.feePayer ?? null
    })));
  return {
    status: 'ok',
    note: inbound.length ? 'Inbound native SOL funding transfers parsed from Helius history.' : 'Helius returned history but no inbound native SOL funding transfers in the sampled window.',
    rows: inbound,
    firstSeenAt: txs.length ? new Date(Math.min(...txs.map((tx) => (tx.timestamp ?? 0) * 1000).filter(Boolean))).toISOString() : null,
    lastSeenAt: txs.length ? new Date(Math.max(...txs.map((tx) => (tx.timestamp ?? 0) * 1000).filter(Boolean))).toISOString() : null,
    transactionCountSampled: txs.length
  };
}

async function rpcSignatureHistory(address: string, limit: number) {
  const rpc = configuredSolanaRpc();
  const connection = new Connection(rpc.url, 'confirmed');
  const signatures = await connection.getSignaturesForAddress(new PublicKey(address), { limit: Math.min(Math.max(limit, 1), 100) }, 'confirmed');
  return {
    status: 'ok',
    provider: rpc.provider,
    note: 'RPC signature history is available. Configure Helius for parsed funding sources and native transfer amounts.',
    rows: signatures.map((sig) => ({
      signature: sig.signature,
      timestamp: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : null,
      slot: sig.slot,
      err: sig.err ?? null
    })),
    firstSeenAt: signatures.length ? new Date(Math.min(...signatures.map((sig) => (sig.blockTime ?? 0) * 1000).filter(Boolean))).toISOString() : null,
    lastSeenAt: signatures.length ? new Date(Math.max(...signatures.map((sig) => (sig.blockTime ?? 0) * 1000).filter(Boolean))).toISOString() : null,
    transactionCountSampled: signatures.length
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet')?.trim();
  const group = searchParams.get('group')?.trim();
  const limit = Number(searchParams.get('limit') ?? '50');
  const store = getMeridianStore();
  const addresses = wallet
    ? [wallet]
    : store.wallets.filter((item) => !group || item.groupId === group).map((item) => item.address);

  const valid = addresses.filter((address) => ADDRESS_RE.test(address));
  if (!valid.length) return Response.json({ error: 'Pass a valid wallet address or use stored Meridian wallets.' }, { status: 400 });

  const rows = await Promise.all(valid.slice(0, 25).map(async (address) => {
    const helius = await heliusHistory(address, limit).catch((error) => ({ status: 'unavailable', note: error instanceof Error ? error.message : 'Helius unavailable.', rows: [] as unknown[] }));
    if (helius.status === 'ok') return { address, source: 'helius', ...helius };
    const rpc = await rpcSignatureHistory(address, limit).catch((error) => ({ status: 'unavailable', note: error instanceof Error ? error.message : 'RPC history unavailable.', rows: [] as unknown[] }));
    return { address, source: 'solana-rpc', heliusNote: helius.note, ...rpc };
  }));

  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    walletCount: rows.length,
    rows,
    execution: 'live-index-read'
  });
}
