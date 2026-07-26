import { decodeTransactionPolicy, policyCheck } from '../../../../lib/transaction-policy';

export const dynamic = 'force-dynamic';

const MAX_SIGNED_TX_BYTES = 32_000;

type DryRunRequest = {
  signedTransaction?: string;
  expectedSigner?: string;
  expectedMint?: string;
  intentId?: string;
};

export async function POST(request: Request) {
  const observedAt = new Date().toISOString();
  const body = await request.json().catch(() => null) as DryRunRequest | null;
  if (!body?.signedTransaction) {
    return Response.json({
      status: 'error',
      observedAt,
      error: 'signedTransaction base64 is required.',
      execution: 'signer-dry-run-no-broadcast',
      safeToBroadcastIfLiveEnabled: false,
      blockers: ['Missing signed transaction.']
    }, { status: 400 });
  }

  let raw: Buffer;
  try { raw = Buffer.from(body.signedTransaction, 'base64'); }
  catch { raw = Buffer.alloc(0); }
  if (raw.length <= 0 || raw.length > MAX_SIGNED_TX_BYTES) {
    return Response.json({ status: 'error', observedAt, error: `Invalid signed transaction size: ${raw.length} bytes.`, execution: 'signer-dry-run-no-broadcast', safeToBroadcastIfLiveEnabled: false, blockers: ['Invalid transaction size.'] }, { status: 400 });
  }

  try {
    const decoded = decodeTransactionPolicy(raw);
    const policy = policyCheck({ decoded, intentId: body.intentId ?? null, expectedSigner: body.expectedSigner ?? null, expectedMint: body.expectedMint ?? null });
    return Response.json({
      status: policy.safeToBroadcastIfLiveEnabled ? 'ok' : 'broadcast_blocked',
      observedAt,
      execution: 'signer-dry-run-no-broadcast',
      signerMatched: policy.signerMatched,
      expectedSigner: body.expectedSigner ?? policy.intent?.expectedSigner ?? null,
      actualSigners: decoded.signerKeys,
      expectedMint: body.expectedMint ?? policy.intent?.expectedMint ?? null,
      expectedMintReferenced: policy.expectedMintReferenced,
      programs: decoded.programs,
      requiredAccountsMatched: policy.requiredAccountsMatched,
      transactionMessageHash: policy.transactionMessageHash,
      safeToBroadcastIfLiveEnabled: policy.safeToBroadcastIfLiveEnabled,
      blockers: policy.blockers,
      intent: policy.intent ? { id: policy.intent.id, status: policy.intent.status, expiresAt: policy.intent.expiresAt } : null,
      serverSigning: false
    });
  } catch (error) {
    return Response.json({
      status: 'error',
      observedAt,
      error: error instanceof Error ? error.message : 'Unable to decode signed transaction.',
      execution: 'signer-dry-run-no-broadcast',
      safeToBroadcastIfLiveEnabled: false,
      blockers: ['Transaction decode failed.'],
      serverSigning: false
    }, { status: 400 });
  }
}

export async function GET() {
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    route: '/api/terminal/signer-dry-run',
    method: 'POST',
    required: ['signedTransaction'],
    optional: ['expectedSigner', 'expectedMint', 'intentId'],
    execution: 'decode-and-policy-check-only-no-broadcast',
    serverSigning: false
  });
}
