import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';
import { mutationBlockedResponse, mutationMeta, sameOriginAllowed } from '../../../lib/mutation-safety';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const LAMPORTS_PER_SOL = 1_000_000_000;

function liveEnabled() { return process.env.LIVE_TRADING_ENABLED === 'true'; }
function maxSol() { return Number(process.env.LIVE_MAX_SOL_PER_SWAP ?? '0.05'); }
function parseAddress(value: unknown, label: string) {
  if (typeof value !== 'string' || !ADDRESS_RE.test(value)) throw new Error(`Missing or invalid ${label}.`);
  return new PublicKey(value);
}
async function unsignedTransfer(from: PublicKey, to: PublicKey, sol: number) {
  if (!Number.isFinite(sol) || sol <= 0) throw new Error('amountSol must be positive.');
  if (sol > maxSol()) throw new Error(`amountSol exceeds LIVE_MAX_SOL_PER_SWAP ${maxSol()}.`);
  const rpc = configuredSolanaRpc();
  const connection = new Connection(rpc.url, 'confirmed');
  const tx = new Transaction();
  tx.feePayer = from;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
  tx.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: Math.round(sol * LAMPORTS_PER_SOL) }));
  return { transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'), rpcProvider: rpc.provider };
}

export async function GET() {
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    signer: 'browser-wallet',
    liveTradingEnabled: liveEnabled(),
    operations: {
      create: { status: 'client-side-only', note: 'Server will not generate/export wallet private keys. Generate in browser wallet/Turnkey only.' },
      import: { status: 'client-side-only', note: 'Server will not receive seed phrases/private keys. Import through wallet provider only.' },
      export: { status: 'blocked-server-side', note: 'Private-key export is intentionally unavailable from the web server.' },
      fund: { status: liveEnabled() ? 'transaction-builder-ready' : 'live-disabled', method: 'POST {operation:"fund", from, to, amountSol}' },
      collect: { status: liveEnabled() ? 'transaction-builder-ready' : 'live-disabled', method: 'POST {operation:"collect", from, to, amountSol}' }
    },
    limits: { maxSolPerTransfer: maxSol() },
    mutation: mutationMeta('Wallet ops are unsigned transaction builders only; no server key custody.'),
    execution: liveEnabled() ? 'browser-signing-required' : 'live-disabled-preflight-only'
  });
}

export async function POST(request: Request) {
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  const body = await request.json().catch(() => null) as null | { operation?: string; from?: string; to?: string; amountSol?: number };
  if (!body?.operation) return Response.json({ status: 'error', error: 'Missing operation.', ...mutationMeta('Wallet op request rejected.') }, { status: 400 });
  if (['create', 'import', 'export'].includes(body.operation)) {
    return Response.json({ status: 'blocked-by-live-gate', operation: body.operation, reason: 'Key custody operations must happen inside the browser wallet/Turnkey provider, not this server.', serverSigning: false, ...mutationMeta('Server-side key custody is blocked.'), execution: 'custody-denied' }, { status: 403 });
  }
  if (!['fund', 'collect'].includes(body.operation)) return Response.json({ status: 'error', error: 'Unsupported operation.', ...mutationMeta('Wallet op request rejected.') }, { status: 400 });
  if (!liveEnabled()) return Response.json({ status: 'blocked-by-live-gate', operation: body.operation, reason: 'LIVE_TRADING_ENABLED is false.', serverSigning: false, ...mutationMeta('Wallet transfer build blocked by live gate.'), execution: 'live-disabled' }, { status: 403 });
  try {
    const from = parseAddress(body.from, 'from');
    const to = parseAddress(body.to, 'to');
    const built = await unsignedTransfer(from, to, Number(body.amountSol));
    return Response.json({ status: 'ok', operation: body.operation, signer: 'browser-wallet', serverSigning: false, requiredSigners: [from.toBase58()], ...built, ...mutationMeta('Unsigned wallet transfer built; browser signing required.'), execution: 'unsigned-transaction-built' });
  } catch (error) {
    return Response.json({ status: 'error', error: error instanceof Error ? error.message : 'Wallet op failed.', ...mutationMeta('Wallet op failed.') }, { status: 400 });
  }
}
