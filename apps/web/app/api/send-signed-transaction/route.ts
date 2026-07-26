import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';
import { getIntent, updateIntent } from '../../../lib/live-store';
import { decodeTransactionPolicy, policyCheck } from '../../../lib/transaction-policy';

export const dynamic = 'force-dynamic';

function liveTradingEnabled() {
  return process.env.LIVE_TRADING_ENABLED === 'true';
}

const MAX_SIGNED_TX_BYTES = 32_000;
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type SendRequest = {
  signedTransaction?: string;
  intentId?: string;
  orderId?: string;
  expectedSigner?: string;
  expectedMint?: string;
  expectedSide?: 'buy' | 'sell' | 'Buy' | 'Sell';
};

function rejectIfLiveDisabled() {
  if (liveTradingEnabled()) return null;
  return Response.json({
    status: 'blocked-by-live-gate',
    observedAt: new Date().toISOString(),
    error: 'Live transaction broadcast is disabled. Set LIVE_TRADING_ENABLED=true only after explicit approval.',
    execution: 'live-disabled',
    liveTradingEnabled: false,
    signer: 'browser-wallet-required',
    serverSigning: false
  }, { status: 403 });
}

function legacyDecodeSignedTransaction(raw: Buffer) {
  try {
    const tx = VersionedTransaction.deserialize(raw);
    return {
      kind: 'versioned',
      signerKeys: tx.message.staticAccountKeys.slice(0, tx.signatures.length).map((key) => key.toBase58()),
      accountKeys: tx.message.staticAccountKeys.map((key) => key.toBase58())
    };
  } catch {
    const tx = Transaction.from(raw);
    return {
      kind: 'legacy',
      signerKeys: tx.signatures.map((sig) => sig.publicKey.toBase58()),
      accountKeys: tx.instructions.flatMap((ix) => ix.keys.map((key) => key.pubkey.toBase58()))
    };
  }
}

function validateIntent(body: SendRequest, decoded: { signerKeys: string[]; accountKeys: string[] }) {
  if (!body.intentId) return 'Broadcast requires intentId so a signed transaction is bound to a stored terminal intent.';
  if (!body.expectedSigner || !ADDRESS_RE.test(body.expectedSigner)) return 'Broadcast requires expectedSigner.';
  try { new PublicKey(body.expectedSigner); } catch { return 'expectedSigner is not a valid Solana public key.'; }
  if (!decoded.signerKeys.includes(body.expectedSigner)) return 'Signed transaction does not include expectedSigner as a signer.';
  if (body.expectedMint) {
    if (!ADDRESS_RE.test(body.expectedMint)) return 'expectedMint is not a valid Solana mint shape.';
    if (!decoded.accountKeys.includes(body.expectedMint)) return 'Signed transaction does not reference expectedMint.';
  }
  return null;
}

export async function POST(request: Request) {
  const disabled = rejectIfLiveDisabled();
  if (disabled) return disabled;

  let body: SendRequest;
  try {
    body = await request.json() as SendRequest;
  } catch {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Invalid JSON body.', execution: 'broadcast-rejected' }, { status: 400 });
  }

  if (!body.signedTransaction || typeof body.signedTransaction !== 'string') {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Missing signedTransaction base64 payload.', execution: 'broadcast-rejected' }, { status: 400 });
  }

  let raw: Buffer;
  try {
    raw = Buffer.from(body.signedTransaction, 'base64');
  } catch {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'signedTransaction must be base64.', execution: 'broadcast-rejected' }, { status: 400 });
  }

  if (raw.length <= 0 || raw.length > MAX_SIGNED_TX_BYTES) {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: `Invalid signed transaction size: ${raw.length} bytes.`, execution: 'broadcast-rejected' }, { status: 400 });
  }

  let decoded: ReturnType<typeof decodeTransactionPolicy>;
  try {
    decoded = decodeTransactionPolicy(raw);
  } catch (error) {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Unable to decode signed transaction.', execution: 'broadcast-rejected' }, { status: 400 });
  }

  const intent = body.intentId ? getIntent(body.intentId) : null;
  const policy = policyCheck({ decoded, intent, intentId: body.intentId ?? null, expectedSigner: body.expectedSigner ?? null, expectedMint: body.expectedMint ?? null });
  const intentError = validateIntent(body, decoded);
  if (intentError || !policy.safeToBroadcastIfLiveEnabled) {
    if (body.intentId && intent) updateIntent(body.intentId, { status: 'broadcast_blocked', note: intentError ?? policy.blockers.join(' | ') });
    return Response.json({ status: 'broadcast_blocked', observedAt: new Date().toISOString(), error: intentError ?? 'Signed transaction failed intent policy.', execution: 'broadcast-rejected', blockers: policy.blockers, decoded: { kind: decoded.kind, signerCount: decoded.signerKeys.length, programs: decoded.programs }, intent: intent ? { id: intent.id, status: intent.status, expiresAt: intent.expiresAt } : null, serverSigning: false }, { status: 400 });
  }
  if (body.intentId && intent) updateIntent(body.intentId, { status: 'broadcast_requested' });

  try {
    const rpc = configuredSolanaRpc();
    const connection = new Connection(rpc.url, 'confirmed');
    const signature = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: 'confirmed'
    });

    return Response.json({
      status: 'sent',
      observedAt: new Date().toISOString(),
      execution: 'broadcast-signed-transaction',
      liveTradingEnabled: true,
      signer: 'client-signed-transaction',
      serverSigning: false,
      intentId: body.intentId ?? null,
      orderId: body.orderId ?? null,
      expectedSigner: body.expectedSigner,
      expectedMint: body.expectedMint ?? null,
      expectedSide: body.expectedSide ?? null,
      rpcProvider: rpc.provider,
      signature,
      intentPolicy: { safeToBroadcastIfLiveEnabled: policy.safeToBroadcastIfLiveEnabled, transactionMessageHash: policy.transactionMessageHash },
      explorerUrl: `https://solscan.io/tx/${signature}`
    });
  } catch (error) {
    return Response.json({
      status: 'error',
      observedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Broadcast failed.',
      execution: 'broadcast-failed',
      serverSigning: false
    }, { status: 500 });
  }
}
