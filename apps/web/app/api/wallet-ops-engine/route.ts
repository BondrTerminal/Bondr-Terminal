import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';
import { mutationBlockedResponse, mutationMeta, sameOriginAllowed } from '../../../lib/mutation-safety';
import { meridianAuthRequiredResponse } from '../../../lib/meridian-auth';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const LAMPORTS_PER_SOL = 1_000_000_000;

function liveEnabled() { return process.env.LIVE_TRADING_ENABLED === 'true'; }
const FUNDING_TEST_SOURCE = '8ynuDCvk9ApT4YfFCsSn4nah5XSMNCzh9V8UXHcY6RKz';
const FUNDING_TEST_DESTINATION = '6oaGmdSBmMq7qCAc36cjivzgMVrozQq35ukka4EHGBuy';
const FUNDING_TEST_MAX_SOL = 0.001;

function maxSol() { return Math.min(Number(process.env.LIVE_MAX_SOL_PER_SWAP ?? '0.05'), FUNDING_TEST_MAX_SOL); }
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
      create: { status: 'encrypted-local-vault', route: '/api/wallet-vault', note: 'Managed-local wallet creation encrypts key material into the local vault; no signing or broadcast is enabled.' },
      import: { status: 'encrypted-local-vault', route: '/api/wallet-vault', note: 'Private-key import is accepted only by the encrypted local vault route; seed phrases remain blocked.' },
      export: { status: 'vault-backup-confirmation-required', route: '/api/wallet-vault', note: 'Private-key backup/export requires vault passphrase plus exact EXPORT PRIVATE KEY confirmation.' },
      fund: { status: liveEnabled() ? 'funding-test-builder-ready' : 'live-disabled', method: 'POST {operation:"fund", from, to, amountSol}', approvedSource: FUNDING_TEST_SOURCE, approvedDestination: FUNDING_TEST_DESTINATION },
      collect: { status: 'disabled', method: 'disabled during funding-only beta test' }
    },
    limits: { maxSolPerTransfer: maxSol(), fundingOnlyBeta: true },
    mutation: mutationMeta('Wallet ops are unsigned transaction builders only; no server key custody.'),
    execution: liveEnabled() ? 'browser-signing-required' : 'live-disabled-preflight-only'
  });
}

export async function POST(request: Request) {
  const authBlocked = await meridianAuthRequiredResponse(request);
  if (authBlocked) return authBlocked;
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  const body = await request.json().catch(() => null) as null | { operation?: string; from?: string; to?: string; amountSol?: number };
  if (!body?.operation) return Response.json({ status: 'error', error: 'Missing operation.', ...mutationMeta('Wallet op request rejected.') }, { status: 400 });
  if (['create', 'import', 'export'].includes(body.operation)) {
    return Response.json({ status: 'blocked-by-live-gate', operation: body.operation, reason: 'Key custody operations must happen inside the browser wallet/Turnkey provider, not this server.', serverSigning: false, ...mutationMeta('Server-side key custody is blocked.'), execution: 'custody-denied' }, { status: 403 });
  }
  if (!['fund'].includes(body.operation)) return Response.json({ status: 'error', error: 'Unsupported operation. Funding-only beta allows operation="fund" only.', ...mutationMeta('Wallet op request rejected.') }, { status: 400 });
  if (!liveEnabled()) return Response.json({ status: 'blocked-by-live-gate', operation: body.operation, reason: 'LIVE_TRADING_ENABLED is false.', serverSigning: false, ...mutationMeta('Wallet transfer build blocked by live gate.'), execution: 'live-disabled' }, { status: 403 });
  try {
    const from = parseAddress(body.from, 'from');
    const to = parseAddress(body.to, 'to');
    if (from.toBase58() !== FUNDING_TEST_SOURCE) throw new Error('Funding source is not approved for this beta test.');
    if (to.toBase58() !== FUNDING_TEST_DESTINATION) throw new Error('Funding destination is not approved for this beta test.');
    const built = await unsignedTransfer(from, to, Number(body.amountSol));
    return Response.json({ status: 'ok', operation: body.operation, signer: 'browser-wallet', serverSigning: false, requiredSigners: [from.toBase58()], ...built, ...mutationMeta('Unsigned wallet transfer built; browser signing required.'), execution: 'unsigned-transaction-built' });
  } catch (error) {
    return Response.json({ status: 'error', error: error instanceof Error ? error.message : 'Wallet op failed.', ...mutationMeta('Wallet op failed.') }, { status: 400 });
  }
}
