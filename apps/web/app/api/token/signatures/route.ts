import { Connection, PublicKey } from '@solana/web3.js';
import { configuredSolanaRpc, getHeliusApiKey } from '../../../../lib/solana-rpc';

export const dynamic = 'force-dynamic';
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TIMEOUT_MS = 8_000;

type HeliusTx = { signature?: string; slot?: number; timestamp?: number; feePayer?: string; type?: string; source?: string };

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' }, cache: 'no-store' }); }
  finally { clearTimeout(timeout); }
}

async function heliusSignatures(address: string, limit: number) {
  const key = getHeliusApiKey();
  if (!key) return { status: 'not-configured', source: 'helius', note: 'HELIUS_API_KEY or HELIUS_RPC_URL api-key not configured.', rows: [] as HeliusTx[] };
  const response = await fetchWithTimeout(`https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${encodeURIComponent(key)}&limit=${Math.min(Math.max(limit, 1), 100)}`);
  if (!response.ok) return { status: 'unavailable', source: 'helius', note: `Helius ${response.status} ${response.statusText}`, rows: [] as HeliusTx[] };
  const rows = await response.json() as HeliusTx[];
  return { status: rows.length ? 'ok' : 'empty', source: 'helius', note: null, rows };
}

async function rpcSignatures(address: string, limit: number) {
  const rpc = configuredSolanaRpc();
  const connection = new Connection(rpc.url, 'confirmed');
  const rows = await connection.getSignaturesForAddress(new PublicKey(address), { limit: Math.min(Math.max(limit, 1), 100) }, 'confirmed');
  return { status: rows.length ? 'ok' : 'empty', source: rpc.provider, note: rpc.configured ? null : 'Public RPC fallback; may be rate-limited and has no parsed transfer detail.', rows };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('mint')?.trim() || searchParams.get('address')?.trim() || '';
  const limit = Number(searchParams.get('limit') ?? '100');
  if (!ADDRESS_RE.test(address)) return Response.json({ error: 'Missing or invalid address/mint.' }, { status: 400 });
  const helius = await heliusSignatures(address, limit).catch((error) => ({ status: 'unavailable', source: 'helius', note: error instanceof Error ? error.message : 'Helius failed.', rows: [] as HeliusTx[] }));
  const rpc = helius.rows.length ? null : await rpcSignatures(address, limit).catch((error) => ({ status: 'unavailable', source: configuredSolanaRpc().provider, note: error instanceof Error ? error.message : 'RPC failed.', rows: [] as unknown[] }));
  const rows = helius.rows.length
    ? helius.rows.map((row) => ({ signature: row.signature ?? null, slot: row.slot ?? null, timestamp: row.timestamp ? new Date(row.timestamp * 1000).toISOString() : null, feePayer: row.feePayer ?? null, type: row.type ?? null, source: row.source ?? null }))
    : ((rpc?.rows ?? []) as Array<{ signature?: string; slot?: number; blockTime?: number | null; err?: unknown }>).map((row) => ({ signature: row.signature ?? null, slot: row.slot ?? null, timestamp: row.blockTime ? new Date(row.blockTime * 1000).toISOString() : null, err: row.err ?? null }));
  return Response.json({ status: 'ok', contract: 'token-signatures-v1', observedAt: new Date().toISOString(), address, provider: helius.rows.length ? 'helius' : rpc?.source ?? 'none', providerStatus: helius.rows.length ? helius.status : rpc?.status ?? helius.status, providerNote: helius.rows.length ? helius.note : rpc?.note ?? helius.note, rows, execution: 'signature-index-read' });
}
