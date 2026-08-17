import { buildJitoMultiWalletSigningSession, type JitoSigningTransactionInput } from '../../../../../lib/jito-multi-wallet-signing-session';

export const dynamic = 'force-dynamic';

type SigningSessionRequest = {
  transactions?: JitoSigningTransactionInput[];
  signingOrder?: string[] | null;
};

export async function POST(request: Request) {
  const observedAt = new Date().toISOString();
  let body: SigningSessionRequest;
  try {
    body = await request.json() as SigningSessionRequest;
  } catch {
    return Response.json({ status: 'error', observedAt, error: 'Invalid JSON body.', execution: 'jito-signing-session-read-only' }, { status: 400 });
  }

  const session = buildJitoMultiWalletSigningSession({
    transactions: body.transactions ?? [],
    signingOrder: body.signingOrder
  });

  return Response.json({
    status: session.status === 'complete' ? 'ok' : 'blocked',
    observedAt,
    execution: 'jito-signing-session-read-only',
    session,
    safety: session.safety
  }, { status: session.status === 'complete' ? 200 : 400 });
}

export async function GET() {
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    route: '/api/relay/jito/multi-wallet-signing-session',
    contract: 'bondr-jito-multi-wallet-signing-session-v1',
    execution: 'jito-signing-session-read-only',
    safety: {
      noSigning: true,
      noBroadcast: true,
      noRelaySubmit: true,
      noServerCustody: true,
      rebuildAllOnExpiry: true
    }
  });
}
