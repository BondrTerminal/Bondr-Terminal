import { buildJitoBundleChainEffectProof, type JitoExpectedWalletEffect } from '../../../../../lib/jito-bundle-chain-effect-proof';
import type { BundleReceiptRecord } from '../../../../../lib/jito-relay-adapter';

export const dynamic = 'force-dynamic';

type ChainEffectProofRequest = {
  receipt?: BundleReceiptRecord | null;
  expectedEffects?: JitoExpectedWalletEffect[];
};

export async function POST(request: Request) {
  const observedAt = new Date().toISOString();
  let body: ChainEffectProofRequest;
  try {
    body = await request.json() as ChainEffectProofRequest;
  } catch {
    return Response.json({ status: 'error', observedAt, error: 'Invalid JSON body.', execution: 'jito-chain-effect-proof-read-only' }, { status: 400 });
  }

  const proof = buildJitoBundleChainEffectProof({
    receipt: body.receipt,
    expectedEffects: body.expectedEffects ?? []
  });

  return Response.json({
    status: proof.status === 'verified' ? 'ok' : 'blocked',
    observedAt,
    execution: 'jito-chain-effect-proof-read-only',
    proof,
    safety: proof.safety
  }, { status: proof.status === 'verified' ? 200 : 400 });
}

export async function GET() {
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    route: '/api/relay/jito/chain-effect-proof',
    contract: 'bondr-jito-bundle-chain-effect-proof-v1',
    execution: 'jito-chain-effect-proof-read-only',
    safety: {
      readOnly: true,
      noSigning: true,
      noBroadcast: true,
      noRelaySubmit: true,
      relayReceiptIsNotEnough: true
    }
  });
}
