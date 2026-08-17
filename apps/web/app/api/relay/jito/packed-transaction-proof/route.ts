import { Connection } from '@solana/web3.js';
import { configuredSolanaRpc } from '../../../../../lib/solana-rpc';
import { buildJitoPackedTransactionProof, type JitoPackedTransactionSimulationProof } from '../../../../../lib/jito-packed-transaction-proof';
import { decodeTransactionPolicyWithLookupTables } from '../../../../../lib/transaction-policy';

export const dynamic = 'force-dynamic';

type PackedTransactionProofRequest = {
  transactionBase64?: string;
  expectedSigners?: string[];
  expectedMint?: string | null;
  requiredAccounts?: string[] | null;
  allowedPrograms?: string[] | null;
  transactionMessageHash?: string | null;
  simulationProof?: JitoPackedTransactionSimulationProof | null;
  maxSerializedBytes?: number;
  maxWalletsPerPackedTransaction?: number;
};

const MAX_PACKED_TX_BYTES = 32_000;

export async function POST(request: Request) {
  const observedAt = new Date().toISOString();
  let body: PackedTransactionProofRequest;
  try {
    body = await request.json() as PackedTransactionProofRequest;
  } catch {
    return Response.json({ status: 'error', observedAt, error: 'Invalid JSON body.', execution: 'jito-packed-proof-read-only' }, { status: 400 });
  }

  if (!body.transactionBase64 || typeof body.transactionBase64 !== 'string') {
    return Response.json({ status: 'error', observedAt, error: 'transactionBase64 is required.', execution: 'jito-packed-proof-read-only' }, { status: 400 });
  }
  if (!Array.isArray(body.expectedSigners) || !body.expectedSigners.length) {
    return Response.json({ status: 'error', observedAt, error: 'expectedSigners[] is required.', execution: 'jito-packed-proof-read-only' }, { status: 400 });
  }

  let raw: Buffer;
  try {
    raw = Buffer.from(body.transactionBase64, 'base64');
  } catch {
    return Response.json({ status: 'error', observedAt, error: 'transactionBase64 must be valid base64.', execution: 'jito-packed-proof-read-only' }, { status: 400 });
  }
  if (raw.length <= 0 || raw.length > MAX_PACKED_TX_BYTES) {
    return Response.json({ status: 'error', observedAt, error: `Invalid packed transaction size: ${raw.length} bytes.`, execution: 'jito-packed-proof-read-only' }, { status: 400 });
  }

  try {
    const rpc = configuredSolanaRpc();
    const decoded = await decodeTransactionPolicyWithLookupTables(raw, new Connection(rpc.url, 'confirmed'));
    const proof = buildJitoPackedTransactionProof({
      decoded,
      serializedBytes: raw.length,
      expectedSigners: body.expectedSigners,
      expectedMint: body.expectedMint,
      requiredAccounts: body.requiredAccounts,
      allowedPrograms: body.allowedPrograms,
      transactionMessageHash: body.transactionMessageHash,
      simulationProof: body.simulationProof,
      maxSerializedBytes: body.maxSerializedBytes,
      maxWalletsPerPackedTransaction: body.maxWalletsPerPackedTransaction
    });

    return Response.json({
      status: proof.status === 'verified' ? 'ok' : 'blocked',
      observedAt,
      execution: 'jito-packed-proof-read-only',
      proof,
      decoded: {
        kind: decoded.kind,
        signerCount: decoded.signerKeys.length,
        programs: decoded.programs,
        messageHash: decoded.messageHash,
        usesAddressLookupTables: Boolean(decoded.usesAddressLookupTables),
        unresolvedAddressLookupTables: decoded.unresolvedAddressLookupTables ?? []
      },
      safety: {
        noSigning: true,
        noRelaySubmit: true,
        noBroadcast: true,
        noServerCustody: true
      }
    }, { status: proof.status === 'verified' ? 200 : 400 });
  } catch (error) {
    return Response.json({
      status: 'error',
      observedAt,
      error: error instanceof Error ? error.message : 'Unable to build Jito packed transaction proof.',
      execution: 'jito-packed-proof-read-only',
      safety: {
        noSigning: true,
        noRelaySubmit: true,
        noBroadcast: true,
        noServerCustody: true
      }
    }, { status: 400 });
  }
}

export async function GET() {
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    route: '/api/relay/jito/packed-transaction-proof',
    contract: 'bondr-jito-packed-transaction-proof-v1',
    execution: 'jito-packed-proof-read-only',
    requiredBody: {
      transactionBase64: 'unsigned-or-signed-versioned-transaction-base64',
      expectedSigners: 'wallet public key[]',
      expectedMint: 'token mint',
      transactionMessageHash: 'expected transaction message hash',
      simulationProof: 'ok simulation proof with matching transactionMessageHash'
    },
    proofRequirements: ['resolved address lookup tables for packed wallet transactions', 'serialized byte limit', 'all expected signers present', 'expected mint/required accounts present', 'simulation proof hash matches transaction message hash', 'program allowlist passes'],
    safety: {
      noSigning: true,
      noRelaySubmit: true,
      noBroadcast: true,
      noServerCustody: true
    }
  });
}
