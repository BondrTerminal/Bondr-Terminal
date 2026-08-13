import { PublicKey } from '@solana/web3.js';
import { getIntentAsync, updateIntentAsync } from '../../../../lib/live-store';
import { sameOriginAllowed, mutationBlockedResponse } from '../../../../lib/mutation-safety';
import { decodeTransactionPolicy, policyCheck } from '../../../../lib/transaction-policy';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_SIGNED_TX_BYTES = 32_000;

type SignedReviewRequest = {
  signedTransaction?: string;
  intentId?: string;
  expectedSigner?: string;
  expectedMint?: string;
  transactionMessageHash?: string | null;
  simulationStatus?: string | null;
};

function validAddress(value: string | null | undefined) {
  if (!value || !ADDRESS_RE.test(value)) return false;
  try { new PublicKey(value); return true; } catch { return false; }
}

export async function POST(request: Request) {
  const origin = sameOriginAllowed(request);
  if (!origin.allowed) return mutationBlockedResponse(origin.note);

  let body: SignedReviewRequest;
  try {
    body = await request.json() as SignedReviewRequest;
  } catch {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Invalid JSON body.', execution: 'signed-review-rejected', broadcast: 'not-performed' }, { status: 400 });
  }

  if (!body.signedTransaction || typeof body.signedTransaction !== 'string') {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'Missing signedTransaction base64 payload.', execution: 'signed-review-rejected', broadcast: 'not-performed' }, { status: 400 });
  }
  if (!body.intentId) {
    return Response.json({ status: 'blocked', observedAt: new Date().toISOString(), error: 'Signed review requires intentId so the wallet signature is bound to the stored terminal intent.', execution: 'signed-review-blocked', broadcast: 'not-performed' }, { status: 400 });
  }

  let raw: Buffer;
  try {
    raw = Buffer.from(body.signedTransaction, 'base64');
  } catch {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: 'signedTransaction must be base64.', execution: 'signed-review-rejected', broadcast: 'not-performed' }, { status: 400 });
  }
  if (raw.length <= 0 || raw.length > MAX_SIGNED_TX_BYTES) {
    return Response.json({ status: 'error', observedAt: new Date().toISOString(), error: `Invalid signed transaction size: ${raw.length} bytes.`, execution: 'signed-review-rejected', broadcast: 'not-performed' }, { status: 400 });
  }

  const intent = await getIntentAsync(body.intentId);
  if (!intent) {
    return Response.json({ status: 'blocked', observedAt: new Date().toISOString(), error: 'Intent not found.', execution: 'signed-review-blocked', broadcast: 'not-performed', intentId: body.intentId }, { status: 404 });
  }

  const expectedSigner = body.expectedSigner ?? intent.expectedSigner;
  const expectedMint = body.expectedMint ?? intent.expectedMint;
  const blockers: string[] = [];
  if (!validAddress(expectedSigner)) blockers.push('expectedSigner is missing or invalid.');
  if (!validAddress(expectedMint)) blockers.push('expectedMint is missing or invalid.');
  if (body.simulationStatus !== 'ok') blockers.push('Simulation result must be ok before a signed payload is accepted for review.');

  let decoded: ReturnType<typeof decodeTransactionPolicy> | null = null;
  if (!blockers.length) {
    try {
      decoded = decodeTransactionPolicy(raw);
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : 'Unable to decode signed transaction.');
    }
  }

  const policy = decoded ? policyCheck({ decoded, intent, intentId: body.intentId, expectedSigner, expectedMint, transactionMessageHash: body.transactionMessageHash ?? intent.transactionMessageHash }) : null;
  const hardBlockers = [...blockers, ...(policy?.blockers.filter((item) => !item.includes('Address lookup table resolution required')) ?? [])];
  const warnings = [
    'Review only: no transaction was broadcast.',
    ...(policy?.blockers.filter((item) => item.includes('Address lookup table resolution required')) ?? [])
  ];
  const reviewPassed = hardBlockers.length === 0;

  await updateIntentAsync(intent.id, {
    status: reviewPassed ? 'signed_client_side' : 'broadcast_blocked',
    note: reviewPassed
      ? `Client-side signature reviewed. messageHash=${policy?.transactionMessageHash ?? intent.transactionMessageHash ?? 'unknown'}. Broadcast still requires separate enablement and policy approval.`
      : `Client-side signature review blocked: ${hardBlockers.join(' | ').slice(0, 240)}`
  });

  return Response.json({
    status: reviewPassed ? 'ok' : 'blocked',
    observedAt: new Date().toISOString(),
    execution: reviewPassed ? 'signed-review-passed' : 'signed-review-blocked',
    broadcast: 'not-performed',
    intentId: intent.id,
    expectedSigner,
    expectedMint,
    simulationStatus: body.simulationStatus ?? null,
    review: {
      signerMatched: Boolean(policy?.signerMatched),
      expectedMintReferenced: Boolean(policy?.expectedMintReferenced),
      requiredAccountsMatched: Boolean(policy?.requiredAccountsMatched),
      programsAllowed: Boolean(policy?.programsAllowed),
      transactionMessageHash: policy?.transactionMessageHash ?? decoded?.messageHash ?? null,
      expectedTransactionMessageHash: body.transactionMessageHash ?? intent.transactionMessageHash ?? null,
      altPolicy: decoded?.usesAddressLookupTables ? 'requires-resolution-before-broadcast' : 'no-address-lookup-tables',
      safeToBroadcastIfLiveEnabled: Boolean(policy?.safeToBroadcastIfLiveEnabled),
      localSignatureReviewPassed: reviewPassed,
      programs: decoded?.programs ?? []
    },
    blockers: hardBlockers,
    warnings,
    serverSigning: false
  }, { status: reviewPassed ? 200 : 400 });
}
