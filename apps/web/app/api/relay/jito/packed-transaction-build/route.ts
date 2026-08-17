import { buildJitoPackedTransaction, type JitoPackedInstructionInput, type JitoPackedLookupTableInput } from '../../../../../lib/jito-packed-transaction-builder';

export const dynamic = 'force-dynamic';

type PackedTransactionBuildRequest = {
  payer?: string;
  recentBlockhash?: string;
  instructions?: JitoPackedInstructionInput[];
  lookupTables?: JitoPackedLookupTableInput[] | null;
  expectedMint?: string | null;
  requiredAccounts?: string[] | null;
  allowedPrograms?: string[] | null;
  computeUnitLimit?: number | null;
  computeUnitPriceMicroLamports?: number | null;
  maxWalletsPerPackedTransaction?: number | null;
};

export async function POST(request: Request) {
  const observedAt = new Date().toISOString();
  let body: PackedTransactionBuildRequest;
  try {
    body = await request.json() as PackedTransactionBuildRequest;
  } catch {
    return Response.json({ status: 'error', observedAt, error: 'Invalid JSON body.', execution: 'jito-packed-build-unsigned-only' }, { status: 400 });
  }

  const result = buildJitoPackedTransaction({
    payer: body.payer ?? '',
    recentBlockhash: body.recentBlockhash ?? '',
    instructions: body.instructions ?? [],
    lookupTables: body.lookupTables,
    expectedMint: body.expectedMint,
    requiredAccounts: body.requiredAccounts,
    allowedPrograms: body.allowedPrograms,
    computeUnitLimit: body.computeUnitLimit,
    computeUnitPriceMicroLamports: body.computeUnitPriceMicroLamports,
    maxWalletsPerPackedTransaction: body.maxWalletsPerPackedTransaction
  });

  return Response.json({
    status: result.status === 'built' ? 'ok' : 'blocked',
    observedAt,
    execution: 'jito-packed-build-unsigned-only',
    result,
    safety: result.safety
  }, { status: result.status === 'built' ? 200 : 400 });
}

export async function GET() {
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    route: '/api/relay/jito/packed-transaction-build',
    contract: 'bondr-jito-packed-transaction-builder-v1',
    execution: 'jito-packed-build-unsigned-only',
    requiredBody: {
      payer: 'fee payer public key',
      recentBlockhash: 'fresh blockhash',
      instructions: 'prepared instruction legs with programId, keys, dataBase64',
      lookupTables: 'resolved address lookup table addresses for packed wallets'
    },
    safety: {
      noSigning: true,
      noBroadcast: true,
      noRelaySubmit: true,
      noServerCustody: true
    }
  });
}
