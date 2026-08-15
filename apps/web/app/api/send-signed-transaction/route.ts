import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../lib/solana-rpc';
import { getIntentAsync, updateIntentAsync } from '../../../lib/live-store';
import { decodeTransactionPolicy, decodeTransactionPolicyWithLookupTables, fundingPolicyCheck, policyCheck } from '../../../lib/transaction-policy';
import { meridianAuthRequiredResponse } from '../../../lib/meridian-auth';
import { sameOriginAllowed, mutationBlockedResponse } from '../../../lib/mutation-safety';
import { liveDisabledPreview } from '../../../lib/transaction-preview';
import type { TransactionPreviewAction } from '../../../lib/transaction-preview';
import { getLiveActivationStatus } from '../../../lib/live-activation';
import { getSolanaRpcHealth } from '../../../lib/rpc-health';

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
  simulationStatus?: string | null;
  transactionMessageHash?: string | null;
  operation?: 'fund' | 'funding' | 'swap' | string;
};

const FUNDING_TEST_SOURCE = '8ynuDCvk9ApT4YfFCsSn4nah5XSMNCzh9V8UXHcY6RKz';
const FUNDING_TEST_DESTINATION = '6oaGmdSBmMq7qCAc36cjivzgMVrozQq35ukka4EHGBuy';
const FUNDING_TEST_MAX_LAMPORTS = 1_000_000; // 0.001 SOL

function isFundingRequest(body: SendRequest | null | undefined) {
  return body?.operation === 'fund' || body?.operation === 'funding';
}

function transactionPreviewKind(body: SendRequest | null | undefined) {
  if (isFundingRequest(body)) return 'funding';
  if (body?.operation === 'create' || body?.operation === 'launch' || body?.operation === 'deploy') return 'launch';
  return 'swap';
}

function rejectIfLiveDisabled(kind: TransactionPreviewAction = 'swap') {
  const liveActivation = getLiveActivationStatus();
  if (liveActivation.broadcastEnabled) return null;
  if (kind === 'funding' && liveActivation.fundingBroadcastEnabled) return null;
  return Response.json({
    status: 'blocked-by-live-gate',
    observedAt: new Date().toISOString(),
    error: kind === 'funding' ? 'Funding broadcast requires LIVE_BETA_FUNDING_BROADCAST_ENABLED=true plus approved funding policy.' : 'Live transaction broadcast is disabled. Set LIVE_TRADING_ENABLED=true, LIVE_BETA_SIGNING_ENABLED=true, and LIVE_BETA_BROADCAST_ENABLED=true only after explicit approval.',
    execution: 'live-disabled',
    liveTradingEnabled: liveActivation.liveTradingEnabled,
    signer: 'browser-wallet-required',
    serverSigning: false,
    signingEnabled: liveActivation.signingEnabled,
    broadcastEnabled: false,
    liveActivation,
    transactionPreview: liveDisabledPreview(kind, '/api/send-signed-transaction', kind === 'funding' ? ['LIVE_BETA_FUNDING_BROADCAST_ENABLED is false.', 'Funding broadcast requires approved sender, receiver, amount cap, simulation, browser wallet signature, and explicit funding broadcast approval.'] : ['LIVE_TRADING_ENABLED, LIVE_BETA_SIGNING_ENABLED, or LIVE_BETA_BROADCAST_ENABLED is false.', 'Broadcast requires explicit final activation.'])
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

function validateIntent(intentId: string | null, expectedSigner: string | null, expectedMint: string | null, decoded: { signerKeys: string[]; accountKeys: string[] }) {
  if (!intentId) return 'Broadcast requires intentId so a signed transaction is bound to a stored terminal intent.';
  if (!expectedSigner || !ADDRESS_RE.test(expectedSigner)) return 'Broadcast requires expectedSigner.';
  try { new PublicKey(expectedSigner); } catch { return 'expectedSigner is not a valid Solana public key.'; }
  if (!decoded.signerKeys.includes(expectedSigner)) return 'Signed transaction does not include expectedSigner as a signer.';
  if (expectedMint) {
    if (!ADDRESS_RE.test(expectedMint)) return 'expectedMint is not a valid Solana mint shape.';
    if (!decoded.accountKeys.includes(expectedMint)) return 'Signed transaction does not reference expectedMint.';
  }
  return null;
}

export async function POST(request: Request) {
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);
  let body: SendRequest;
  try {
    body = await request.json() as SendRequest;
  } catch {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Invalid JSON body.', execution: 'broadcast-rejected' }, { status: 400 });
  }

  const fundingRequest = isFundingRequest(body);
  const disabled = rejectIfLiveDisabled(transactionPreviewKind(body));
  if (disabled) return disabled;
  const authBlocked = await meridianAuthRequiredResponse(request);
  if (authBlocked) return authBlocked;

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
  const rpc = configuredSolanaRpc();
  const connection = new Connection(rpc.url, 'confirmed');
  try {
    decoded = await decodeTransactionPolicyWithLookupTables(raw, connection);
  } catch (error) {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Unable to decode signed transaction.', execution: 'broadcast-rejected' }, { status: 400 });
  }

  const intent = body.intentId ? await getIntentAsync(body.intentId) : null;
  const expectedSigner = body.expectedSigner ?? intent?.expectedSigner ?? null;
  const expectedMint = body.expectedMint ?? intent?.expectedMint ?? null;
  const simulationError = body.simulationStatus === 'ok' ? null : 'Broadcast requires a fresh ok simulationStatus tied to the signed transaction review.';
  let policy: ReturnType<typeof policyCheck> | null = null;
  let fundingPolicy: ReturnType<typeof fundingPolicyCheck> | null = null;

  if (fundingRequest) {
    if (!expectedSigner) {
      return Response.json({ status: 'broadcast_blocked', observedAt: new Date().toISOString(), error: 'Funding broadcast requires expectedSigner.', execution: 'funding-broadcast-rejected', serverSigning: false }, { status: 400 });
    }
    fundingPolicy = fundingPolicyCheck({ decoded, expectedSigner, allowedSource: FUNDING_TEST_SOURCE, allowedDestination: FUNDING_TEST_DESTINATION, maxLamports: FUNDING_TEST_MAX_LAMPORTS });
    if (simulationError || !fundingPolicy.safeToBroadcastFunding) {
      return Response.json({ status: 'broadcast_blocked', observedAt: new Date().toISOString(), error: simulationError ?? 'Signed funding transaction failed funding policy.', execution: 'funding-broadcast-rejected', blockers: [...(simulationError ? [simulationError] : []), ...fundingPolicy.blockers], decoded: { kind: decoded.kind, signerCount: decoded.signerKeys.length, programs: decoded.programs, messageHash: decoded.messageHash, usesAddressLookupTables: Boolean(decoded.usesAddressLookupTables), systemTransfers: decoded.systemTransfers }, fundingPolicy: { transfer: fundingPolicy.transfer, maxLamports: fundingPolicy.maxLamports, approvedSource: FUNDING_TEST_SOURCE, approvedDestination: FUNDING_TEST_DESTINATION }, serverSigning: false }, { status: 400 });
    }
  } else {
    policy = policyCheck({ decoded, intent, intentId: body.intentId ?? null, expectedSigner: expectedSigner ?? null, expectedMint: expectedMint ?? null, transactionMessageHash: intent?.transactionMessageHash ?? body.transactionMessageHash ?? null, allowWalletAssertionHashMismatch: true });
    const intentError = validateIntent(body.intentId ?? null, expectedSigner, expectedMint, decoded);
    if (intentError || simulationError || !policy.safeToBroadcastIfLiveEnabled) {
      const error = intentError ?? simulationError ?? 'Signed transaction failed intent policy.';
      if (body.intentId && intent) await updateIntentAsync(body.intentId, { status: 'broadcast_blocked', note: error ?? policy.blockers.join(' | ') });
      return Response.json({ status: 'broadcast_blocked', observedAt: new Date().toISOString(), error, execution: 'broadcast-rejected', blockers: [...(simulationError ? [simulationError] : []), ...policy.blockers], warnings: policy.warnings, decoded: { kind: decoded.kind, signerCount: decoded.signerKeys.length, programs: decoded.programs, messageHash: decoded.messageHash, usesAddressLookupTables: Boolean(decoded.usesAddressLookupTables), unresolvedAddressLookupTables: decoded.unresolvedAddressLookupTables ?? [] }, intent: intent ? { id: intent.id, status: intent.status, expiresAt: intent.expiresAt, transactionMessageHash: intent.transactionMessageHash } : null, serverSigning: false }, { status: 400 });
    }
    if (body.intentId && intent) await updateIntentAsync(body.intentId, { status: 'broadcast_requested' });
  }

  try {
    const signature = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: 'confirmed'
    });
    if (body.intentId && intent) await updateIntentAsync(body.intentId, { status: 'broadcast_sent', note: `Broadcast submitted: ${signature}` });

    return Response.json({
      status: 'sent',
      observedAt: new Date().toISOString(),
      execution: fundingRequest ? 'funding-broadcast-signed-transaction' : 'broadcast-signed-transaction',
      liveTradingEnabled: true,
      signer: 'client-signed-transaction',
      serverSigning: false,
      intentId: body.intentId ?? null,
      orderId: body.orderId ?? null,
      expectedSigner,
      expectedMint: expectedMint ?? null,
      expectedSide: body.expectedSide ?? null,
      simulationStatus: body.simulationStatus ?? null,
      rpcProvider: rpc.provider,
      signature,
      intentPolicy: policy ? { safeToBroadcastIfLiveEnabled: policy.safeToBroadcastIfLiveEnabled, transactionMessageHash: policy.transactionMessageHash, messageHashMatched: policy.messageHashMatched, warnings: policy.warnings } : null,
      fundingPolicy: fundingPolicy ? { safeToBroadcastFunding: fundingPolicy.safeToBroadcastFunding, transfer: fundingPolicy.transfer, maxLamports: fundingPolicy.maxLamports, approvedSource: FUNDING_TEST_SOURCE, approvedDestination: FUNDING_TEST_DESTINATION } : null,
      explorerUrl: `https://solscan.io/tx/${signature}`
    });
  } catch (error) {
    if (body.intentId && intent) await updateIntentAsync(body.intentId, { status: 'failed', note: error instanceof Error ? error.message.slice(0, 240) : 'Broadcast failed.' });
    return Response.json({
      status: 'error',
      observedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Broadcast failed.',
      execution: 'broadcast-failed',
      serverSigning: false
    }, { status: 500 });
  }
}
