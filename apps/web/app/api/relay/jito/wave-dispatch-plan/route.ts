import { buildJitoWaveDispatchPlan, type JitoWaveApproval, type JitoWaveDispatchTransaction } from '../../../../../lib/jito-wave-dispatch-plan';
import type { BundleReceiptRecord, JitoBundlePayload } from '../../../../../lib/jito-relay-adapter';

export const dynamic = 'force-dynamic';

type WaveDispatchPlanRequest = {
  transactions?: JitoWaveDispatchTransaction[];
  expectedSigners?: string[];
  expectedMint?: string;
  tipLamports?: number;
  approvals?: JitoWaveApproval[] | null;
  priorWaveReceipts?: BundleReceiptRecord[] | null;
  maxTransactionsPerBundle?: number;
  projectId?: string | null;
  rail?: JitoBundlePayload['rail'];
};

export async function POST(request: Request) {
  const observedAt = new Date().toISOString();
  let body: WaveDispatchPlanRequest;
  try {
    body = await request.json() as WaveDispatchPlanRequest;
  } catch {
    return Response.json({ status: 'error', observedAt, error: 'Invalid JSON body.', execution: 'jito-wave-dispatch-plan-only' }, { status: 400 });
  }

  const plan = buildJitoWaveDispatchPlan({
    transactions: body.transactions ?? [],
    expectedSigners: body.expectedSigners ?? [],
    expectedMint: body.expectedMint ?? '',
    tipLamports: body.tipLamports ?? 0,
    approvals: body.approvals,
    priorWaveReceipts: body.priorWaveReceipts,
    maxTransactionsPerBundle: body.maxTransactionsPerBundle,
    projectId: body.projectId,
    rail: body.rail
  });

  return Response.json({
    status: plan.status === 'ready' ? 'ok' : 'blocked',
    observedAt,
    execution: 'jito-wave-dispatch-plan-only',
    plan,
    safety: plan.safety
  }, { status: plan.status === 'ready' ? 200 : 400 });
}

export async function GET() {
  return Response.json({
    status: 'ok',
    observedAt: new Date().toISOString(),
    route: '/api/relay/jito/wave-dispatch-plan',
    contract: 'bondr-jito-wave-dispatch-plan-v1',
    execution: 'jito-wave-dispatch-plan-only',
    safety: {
      noRelaySubmit: true,
      noBroadcast: true,
      noSigning: true,
      explicitApprovalPerWave: true,
      priorWaveReceiptRequiredForOverflow: true
    }
  });
}
